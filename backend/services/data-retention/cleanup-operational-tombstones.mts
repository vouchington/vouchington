/* oxlint-disable no-await-in-loop -- each capped page commits before the next keyset page. */
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'
import { getRetentionCutoffDate } from './cleanup-options.mts'
import { cleanupDeletedConversationPage } from './cleanup-deleted-conversations.mts'
import { listCandidates } from './cleanup-operational-tombstone-candidates.mts'
type Family =
  | 'activitypub_post_likes'
  | 'remote_actors'
  | 'feed_hostname_blocks'
  | 'other_hostname_blocks'
  | 'deleted_conversations'
  | 'app_attestation_keys'
type GenericFamily = Exclude<Family, 'deleted_conversations'>
export type Plan = {
  table: string
  timestamp: string
  predicate: string
} & (
  | { retentionDays: number; retentionMonths?: never }
  | { retentionMonths: number; retentionDays?: never }
)
function getPlanCutoffDate(plan: Plan, now = new Date()): Date {
  if (plan.retentionMonths === undefined) return getRetentionCutoffDate(plan.retentionDays, now)
  const cutoff = new Date(now)
  const day = cutoff.getUTCDate()
  cutoff.setUTCDate(1)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - plan.retentionMonths)
  const lastDay = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
  ).getUTCDate()
  cutoff.setUTCDate(Math.min(day, lastDay))
  return cutoff
}
const PLANS: Record<GenericFamily, Plan> = {
  activitypub_post_likes: {
    table: 'activitypub_post_likes',
    timestamp: 'source.deleted_at',
    predicate: 'source.deleted_at IS NOT NULL',
    retentionDays: 30,
  },
  remote_actors: {
    table: 'remote_actors',
    timestamp: 'source.fetched_at',
    predicate: `source.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM relation__remote_actor__follow__user relation
        WHERE relation.subject_id = source.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM activitypub_post_likes like_row
        WHERE like_row.remote_actor_id = source.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM activitypub_inbox_delivery_work_items work_item
        WHERE work_item.remote_actor_id = source.id
      )`,
    retentionDays: 90,
  },
  feed_hostname_blocks: {
    table: 'url_hostname_blocks',
    timestamp: 'source.lifted_at',
    predicate: 'source.lifted_at IS NOT NULL AND source.domain_blocklist_source_id IS NOT NULL',
    retentionDays: 30,
  },
  other_hostname_blocks: {
    table: 'url_hostname_blocks',
    timestamp: 'source.lifted_at',
    predicate: 'source.lifted_at IS NOT NULL AND source.domain_blocklist_source_id IS NULL',
    retentionMonths: 24,
  },
  app_attestation_keys: {
    table: 'app_attestation_keys',
    timestamp: 'COALESCE(source.last_used_at, uuid_extract_timestamp(source.id))',
    predicate: 'TRUE',
    retentionDays: 180,
  },
}
export type OperationalTombstoneCleanupResult = {
  deleted: number
  hasMore: boolean
  continuation: { at: string; id: string } | null
}
export type OperationalTombstonePageResult = OperationalTombstoneCleanupResult & {
  stalled: boolean
}

type CleanupOptions = {
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
  borrowedQuery?: TransactionQuery
}
export type Cursor = {
  cursor_at: string | null
  cursor_id: string | null
  sweep_cutoff_at: Date | null
}
export type Candidate = { id: string; position_at: string }

/** Each page and its cursor checkpoint commit together; a capped run resumes next daily tick. */
export async function cleanupOperationalTombstones(
  family: Family,
  options: CleanupOptions,
): Promise<OperationalTombstoneCleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, 500, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  let deleted = 0
  let hasMore = false
  let continuation: OperationalTombstoneCleanupResult['continuation'] = null
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result =
      family === 'deleted_conversations'
        ? await cleanupDeletedConversationPage(batchSize, options) // no-mistakes-disable-line query-reached-per-item: each bounded conversation stage commits with its cursor before the next page
        : await cleanupPage(family, batchSize, options) // no-mistakes-disable-line query-reached-per-item: each bounded indexed page commits with its cursor before the next page
    deleted += result.deleted
    hasMore = result.hasMore
    continuation = result.continuation
    if (!hasMore || result.stalled) break
  }
  return { deleted, hasMore, continuation }
}

async function cleanupPage(
  family: GenericFamily,
  batchSize: number,
  options: CleanupOptions,
): Promise<OperationalTombstonePageResult> {
  if (options.borrowedQuery)
    return cleanupPageWithQuery(family, batchSize, options, options.borrowedQuery)
  await using query = await beginTransaction()
  const result = await cleanupPageWithQuery(family, batchSize, options, query)
  await query.commit()
  return result
}

async function cleanupPageWithQuery(
  family: GenericFamily,
  batchSize: number,
  options: CleanupOptions,
  query: TransactionQuery,
): Promise<OperationalTombstonePageResult> {
  const plan = PLANS[family]
  const trackCursor = options.borrowedQuery !== undefined || options.lowerBoundDate === undefined
  let cursor: Cursor = { cursor_at: null, cursor_id: null, sweep_cutoff_at: null }
  if (trackCursor) {
    await query(
      `/* ensureOperationalTombstoneCursor */
     INSERT INTO operational_tombstone_retention_cursors (cleanup_name)
     VALUES ($1) ON CONFLICT DO NOTHING`,
      [family],
    )
    cursor = (
      await query<Cursor>(
        `/* lockOperationalTombstoneCursor */
       SELECT cursor_at::text AS cursor_at, cursor_id, sweep_cutoff_at
       FROM operational_tombstone_retention_cursors
       WHERE cleanup_name = $1 FOR UPDATE`,
        [family],
      )
    ).rows[0]
  }
  const cutoff = cursor.sweep_cutoff_at ?? getPlanCutoffDate(plan, options.now)
  const candidates = await listCandidates(
    query,
    plan,
    cutoff,
    batchSize + 1,
    cursor,
    options.lowerBoundDate,
  )
  const page = candidates.slice(0, batchSize)
  const { rowCount } = page.length
    ? await query(
        `/* deleteOperationalTombstonePage */
         DELETE FROM ${plan.table} source
         WHERE source.id = ANY($1::uuid[])
           AND ${plan.timestamp} < $2::timestamptz
           AND ${plan.predicate}`,
        [page.map(candidate => candidate.id), cutoff],
      )
    : { rowCount: 0 }
  const hasMore = candidates.length > batchSize
  const last = hasMore ? page.at(-1)! : null
  if (trackCursor)
    await query(
      `/* checkpointOperationalTombstoneCursor */
     UPDATE operational_tombstone_retention_cursors
     SET cursor_at = $2::timestamptz, cursor_id = $3::uuid, sweep_cutoff_at = $4::timestamptz
     WHERE cleanup_name = $1`,
      [family, last?.position_at ?? null, last?.id ?? null, last ? cutoff : null],
    )
  return {
    deleted: rowCount ?? 0,
    hasMore,
    continuation: last ? { at: last.position_at, id: last.id } : null,
    stalled: false,
  }
}
