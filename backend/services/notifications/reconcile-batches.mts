import { randomUUID } from 'node:crypto'
import { writePool, type PoolClient } from '@data-stores/psql'

export type CreatedNotification = { user_id: string; id: string }

export type ReconcileNotificationsOptions = {
  batchSize?: number
  onCreatedNotifications?: (createdNotifications: CreatedNotification[]) => Promise<void> | void
}

type ReconcileNotificationBatchConfig = {
  batchQueryComment: string
  createRecipients: (client: PoolClient, recipientTable: string) => Promise<void>
  insertBatch: (
    client: PoolClient,
    recipientIds: string[],
    createdTable: string,
  ) => Promise<CreatedNotification[]>
  prune: (client: PoolClient, recipientTable: string) => Promise<number>
}

type CreatedNotificationCursor = {
  lastUserId: string
  lastNotificationId: string
}

const DEFAULT_RECONCILE_BATCH_SIZE = 500

export async function reconcileNotificationBatches(
  config: ReconcileNotificationBatchConfig,
  options: ReconcileNotificationsOptions = {},
): Promise<{ created: number; pruned: number }> {
  const batchSize = options.batchSize ?? DEFAULT_RECONCILE_BATCH_SIZE
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('batchSize must be a positive integer')
  }

  const client = await writePool.connect()
  const recipientTable = createTempTableName('temp_notification_reconcile_recipients')
  const createdTable = createTempTableName('temp_notification_reconcile_created')

  try {
    await createTempTables(client, recipientTable, createdTable)
    await config.createRecipients(client, recipientTable)

    let created = 0
    let lastUserId: string | null = null
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- each keyset page mutates session temp tables before advancing its cursor
      const batch = await createNextRecipientNotificationBatch(
        client,
        config,
        recipientTable,
        createdTable,
        lastUserId,
        batchSize,
      )
      if (!batch) break

      lastUserId = batch.lastUserId
      created += batch.created
    }

    const pruned = await config.prune(client, recipientTable)
    await dispatchCreatedNotificationBatches(client, createdTable, batchSize, options)
    return { created, pruned }
  } finally {
    await dropTempTables(client, recipientTable, createdTable).catch(() => {})
    client.release()
  }
}

async function createNextRecipientNotificationBatch(
  client: PoolClient,
  config: ReconcileNotificationBatchConfig,
  recipientTable: string,
  createdTable: string,
  lastUserId: string | null,
  batchSize: number,
): Promise<{ lastUserId: string; created: number } | null> {
  const result = await client.query<{ user_id: string }>(
    `/* ${config.batchQueryComment} */
      SELECT user_id
      FROM ${recipientTable}
      WHERE ($1::uuid IS NULL OR user_id > $1)
      ORDER BY user_id
      LIMIT $2
    `,
    [lastUserId, batchSize],
  )
  const rows: Array<{ user_id: string }> = result.rows
  if (rows.length === 0) return null

  const createdBatch = await config.insertBatch(
    client,
    rows.map(row => row.user_id),
    createdTable,
  )
  return { lastUserId: rows[rows.length - 1]!.user_id, created: createdBatch.length }
}

function createTempTableName(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`
}

async function dispatchCreatedNotificationBatches(
  client: PoolClient,
  createdTable: string,
  batchSize: number,
  options: ReconcileNotificationsOptions,
): Promise<void> {
  if (!options.onCreatedNotifications) return

  let cursor: CreatedNotificationCursor | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each callback applies backpressure before the keyset cursor advances
    const nextCursor = await dispatchNextCreatedNotificationBatch(
      client,
      createdTable,
      batchSize,
      cursor,
      options.onCreatedNotifications,
    )
    if (!nextCursor) break

    cursor = nextCursor
  }
}

async function dispatchNextCreatedNotificationBatch(
  client: PoolClient,
  createdTable: string,
  batchSize: number,
  cursor: CreatedNotificationCursor | null,
  onCreatedNotifications: NonNullable<ReconcileNotificationsOptions['onCreatedNotifications']>,
): Promise<CreatedNotificationCursor | null> {
  const result = await client.query<CreatedNotification>(
    `/* selectCreatedNotificationBatch */
      SELECT user_id, id
      FROM ${createdTable}
      WHERE (
        $1::uuid IS NULL
        OR user_id > $1
        OR (user_id = $1 AND id > $2::uuid)
      )
      ORDER BY user_id, id
      LIMIT $3
    `,
    [cursor?.lastUserId ?? null, cursor?.lastNotificationId ?? null, batchSize],
  )
  const rows: CreatedNotification[] = result.rows
  if (rows.length === 0) return null

  await onCreatedNotifications(rows)
  const lastRow = rows[rows.length - 1]!
  return { lastUserId: lastRow.user_id, lastNotificationId: lastRow.id }
}

async function createTempTables(
  client: PoolClient,
  recipientTable: string,
  createdTable: string,
): Promise<void> {
  await client.query(`/* createNotificationReconcileTempTables */
    CREATE TEMP TABLE ${recipientTable} (
      user_id UUID PRIMARY KEY
    )
  `)
  await client.query(`/* createNotificationReconcileTempTables */
    CREATE TEMP TABLE ${createdTable} (
      user_id UUID NOT NULL,
      id UUID NOT NULL,
      PRIMARY KEY (user_id, id)
    )
  `)
}

async function dropTempTables(
  client: PoolClient,
  recipientTable: string,
  createdTable: string,
): Promise<void> {
  await client.query(`/* dropNotificationReconcileTempTables */
    DROP TABLE IF EXISTS ${recipientTable}, ${createdTable}
  `)
}
