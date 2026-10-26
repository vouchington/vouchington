import { getNotificationsWorkLimit } from './work-limits.mts'
import { writePool, type PoolClient } from '@data-stores/psql'
import onError from '@modules/on-error'
import {
  type CreatedNotification,
  createTempTableName,
  createTempTables,
  dispatchCreatedNotificationBatches,
  dropTempTables,
} from './reconcile-temp-tables.mts'

export type { CreatedNotification } from './reconcile-temp-tables.mts'

export type ReconcileNotificationsOptions = {
  batchSize?: number
  /** Recipients per job; defaults to the `reconcile_recipient_page_size` work limit. */
  pageSize?: number
  /** The last recipient of the previous page; absent for the first page. */
  afterUserId?: string
  onCreatedNotifications?: (createdNotifications: CreatedNotification[]) => Promise<void> | void
}

/** The keyset slice of recipients one job owns: ids after `afterUserId`, at most `limit`. */
export type RecipientPage = { afterUserId: string | null; limit: number }

/** The user-id range one page covers; `throughUserId` is null on the last page. */
export type RecipientPageRange = {
  afterUserId: string | null
  throughUserId: string | null
}

export type ReconcileNotificationsResult = {
  created: number
  pruned: number
  nextVisibilityCursor?: { userId: string; notificationId: string }
  /** Present only when a full page may be followed by more recipients. */
  nextAfterUserId?: string
}

type ReconcileNotificationBatchConfig = {
  batchQueryComment:
    | 'selectRssFeedItemNotificationRecipientBatch'
    | 'selectPostNotificationRecipientBatch'
  createRecipients: (
    client: PoolClient,
    recipientTable: string,
    page: RecipientPage,
  ) => Promise<void>
  insertBatch: (
    client: PoolClient,
    recipientIds: string[],
    createdTable: string,
  ) => Promise<CreatedNotification[]>
  prune: (client: PoolClient, recipientTable: string, range: RecipientPageRange) => Promise<number>
}

export async function reconcileNotificationBatches(
  config: ReconcileNotificationBatchConfig,
  options: ReconcileNotificationsOptions = {},
): Promise<ReconcileNotificationsResult> {
  const DEFAULT_RECONCILE_BATCH_SIZE = getNotificationsWorkLimit('reconcile_batch_size')
  const batchSize = options.batchSize ?? DEFAULT_RECONCILE_BATCH_SIZE
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('batchSize must be a positive integer')
  }
  const pageSize = options.pageSize ?? getNotificationsWorkLimit('reconcile_recipient_page_size')
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error('pageSize must be a positive integer')
  }
  const afterUserId = options.afterUserId ?? null

  const client = await writePool.connect()
  const recipientTable = createTempTableName('temp_notification_reconcile_recipients')
  const createdTable = createTempTableName('temp_notification_reconcile_created')

  try {
    await createTempTables(client, recipientTable, createdTable)
    await config.createRecipients(client, recipientTable, { afterUserId, limit: pageSize })

    let created = 0
    let recipients = 0
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
      recipients += batch.recipients
    }

    // A full page may be followed by more recipients: only then does this job stop at its last id.
    const nextAfterUserId = recipients === pageSize && lastUserId ? lastUserId : undefined
    const pruned = await config.prune(client, recipientTable, {
      afterUserId,
      throughUserId: nextAfterUserId ?? null,
    })
    await dispatchCreatedNotificationBatches(
      client,
      createdTable,
      batchSize,
      options.onCreatedNotifications,
    )
    return { created, pruned, ...(nextAfterUserId ? { nextAfterUserId } : {}) }
  } finally {
    await dropTempTables(client, recipientTable, createdTable).catch(onError)
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
): Promise<{ lastUserId: string; created: number; recipients: number } | null> {
  const query = `user_id
      FROM ${recipientTable}
      WHERE ($1::uuid IS NULL OR user_id > $1)
      ORDER BY user_id
      LIMIT $2
    `
  const values = [lastUserId, batchSize]
  const result =
    config.batchQueryComment === 'selectRssFeedItemNotificationRecipientBatch'
      ? await client.query<{ user_id: string }>(
          `/* selectRssFeedItemNotificationRecipientBatch */\n      SELECT ${query}`,
          values,
        )
      : await client.query<{ user_id: string }>(
          `/* selectPostNotificationRecipientBatch */\n      SELECT ${query}`,
          values,
        )
  const rows: Array<{ user_id: string }> = result.rows
  if (rows.length === 0) return null

  const createdBatch = await config.insertBatch(
    client,
    rows.map(row => row.user_id),
    createdTable,
  )
  return {
    lastUserId: rows[rows.length - 1]!.user_id,
    created: createdBatch.length,
    recipients: rows.length,
  }
}
