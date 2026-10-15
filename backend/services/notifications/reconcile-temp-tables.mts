import { randomUUID } from 'node:crypto'
import type { PoolClient } from '@data-stores/psql'
import type { CreatedNotification } from './reconcile-batches.mts'

type OnCreatedNotifications = (createdNotifications: CreatedNotification[]) => Promise<void> | void

type CreatedNotificationCursor = {
  lastUserId: string
  lastNotificationId: string
}

export function createTempTableName(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`
}

export async function dispatchCreatedNotificationBatches(
  client: PoolClient,
  createdTable: string,
  batchSize: number,
  onCreatedNotifications: OnCreatedNotifications | undefined,
): Promise<void> {
  if (!onCreatedNotifications) return

  let cursor: CreatedNotificationCursor | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each callback applies backpressure before the keyset cursor advances
    const nextCursor = await dispatchNextCreatedNotificationBatch(
      client,
      createdTable,
      batchSize,
      cursor,
      onCreatedNotifications,
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
  onCreatedNotifications: OnCreatedNotifications,
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

export async function createTempTables(
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

export async function dropTempTables(
  client: PoolClient,
  recipientTable: string,
  createdTable: string,
): Promise<void> {
  await client.query(`/* dropNotificationReconcileTempTables */
    DROP TABLE IF EXISTS ${recipientTable}, ${createdTable}
  `)
}
