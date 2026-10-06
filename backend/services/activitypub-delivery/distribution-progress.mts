import { getRemoteActorsWorkLimit } from '@services/remote-actors/work-limits'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { listRemoteFollowerInboxPage } from '@services/remote-actors'
import sql from 'sql-template-strings'
import { randomUUID } from 'node:crypto'

export type PreparedActivityDistributionPage =
  | { status: 'completed' }
  | { status: 'busy'; retryAfterMs: number }
  | {
      status: 'ready'
      leaseToken: string
      expectedRemoteActorId: string | null
      nextRemoteActorId: string | null
      inboxUrls: string[]
      hasMore: boolean
    }

type CheckpointRow = {
  source_user_id: string
  cursor_remote_actor_id: string | null
  completed_at: Date | null
  retry_after_ms: number
}

type DistributionPageDependencies = {
  listRemoteFollowerInboxPage: typeof listRemoteFollowerInboxPage
}

// Reads a bounded follower page against the primary database after ensuring the activity's durable
// work item exists. The transaction ends before callers touch Valkey; the lease token fences
// advancement after expiry and the cursor compare-and-swap preserves the prepared page boundary.
export async function prepareActivityDistributionPage(
  activityId: string,
  sourceUserId: string,
  dependencies: Partial<DistributionPageDependencies> = {},
): Promise<PreparedActivityDistributionPage> {
  const deps = { listRemoteFollowerInboxPage, ...dependencies }
  await using transaction = await beginTransaction()
  const page = await prepareActivityDistributionPageInTransaction(
    activityId,
    sourceUserId,
    deps,
    transaction,
  )
  await transaction.commit()
  return page
}

async function prepareActivityDistributionPageInTransaction(
  activityId: string,
  sourceUserId: string,
  dependencies: DistributionPageDependencies,
  query: TransactionQuery,
): Promise<PreparedActivityDistributionPage> {
  const FOLLOWER_INBOX_BATCH_SIZE = getRemoteActorsWorkLimit('follower_inbox_batch_size')
  await query(sql`/* prepareActivityDistributionPage:insert */
      INSERT INTO activitypub_distribution_work_items (activity_id, source_user_id)
      VALUES (${activityId}, ${sourceUserId})
      ON CONFLICT (activity_id) DO NOTHING
    `)
  const checkpoint = await getActivityDistributionCheckpoint(activityId, query)
  if (!checkpoint) throw new Error(`Missing ActivityPub distribution checkpoint: ${activityId}`)
  if (checkpoint.source_user_id !== sourceUserId) {
    throw new Error(`ActivityPub distribution source mismatch: ${activityId}`)
  }
  if (checkpoint.completed_at) return { status: 'completed' }
  if (checkpoint.retry_after_ms > 0) {
    return { status: 'busy', retryAfterMs: checkpoint.retry_after_ms }
  }
  const leaseToken = randomUUID()
  const leaseMs = getRemoteActorsWorkLimit('distribution_lease_ms')
  await query(sql`/* prepareActivityDistributionPage:claim */
    UPDATE activitypub_distribution_work_items
    SET lease_token = ${leaseToken}, leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + ${leaseMs} * INTERVAL '1 millisecond',
      attempt_count = attempt_count + 1
    WHERE activity_id = ${activityId}
  `)

  const candidates = await dependencies.listRemoteFollowerInboxPage(
    sourceUserId,
    checkpoint.cursor_remote_actor_id,
    FOLLOWER_INBOX_BATCH_SIZE + 1,
    { query },
  )
  const page = candidates.slice(0, FOLLOWER_INBOX_BATCH_SIZE)
  return {
    status: 'ready',
    leaseToken,
    expectedRemoteActorId: checkpoint.cursor_remote_actor_id,
    nextRemoteActorId: page.at(-1)?.remoteActorId ?? checkpoint.cursor_remote_actor_id,
    inboxUrls: [...new Set(page.flatMap(row => (row.inboxUrl ? [row.inboxUrl] : [])))],
    hasMore: candidates.length > FOLLOWER_INBOX_BATCH_SIZE,
  }
}

// Advances only the checkpoint snapshot used to prepare a page. A zero-row page marks the
// checkpoint terminal; a replay after a committed page cannot advance or enqueue a continuation.
export async function commitActivityDistributionPage(
  activityId: string,
  sourceUserId: string,
  expectedRemoteActorId: string | null,
  nextRemoteActorId: string | null,
  completed: boolean,
  leaseToken: string,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* commitActivityDistributionPage */
    UPDATE activitypub_distribution_work_items
    SET cursor_remote_actor_id = ${nextRemoteActorId},
      completed_at = CASE WHEN ${completed} THEN clock_timestamp() ELSE completed_at END,
      lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE activity_id = ${activityId}
      AND source_user_id = ${sourceUserId}
      AND completed_at IS NULL
      AND lease_token = ${leaseToken}
      AND lease_expires_at > clock_timestamp()
      AND cursor_remote_actor_id IS NOT DISTINCT FROM ${expectedRemoteActorId}
  `)
  return rowCount === 1
}

// A rejected Valkey handoff leaves its cursor unchanged and makes this page immediately retryable.
export async function releaseActivityDistributionPage(
  activityId: string,
  leaseToken: string,
): Promise<void> {
  await write(sql`/* releaseActivityDistributionPage */
    UPDATE activitypub_distribution_work_items
    SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE activity_id = ${activityId} AND lease_token = ${leaseToken}
      AND completed_at IS NULL
  `)
}

async function getActivityDistributionCheckpoint(
  activityId: string,
  query: TransactionQuery,
): Promise<CheckpointRow | undefined> {
  const { rows } = await query<CheckpointRow>(sql`/* getActivityDistributionCheckpoint */
    SELECT source_user_id, cursor_remote_actor_id, completed_at,
      CEIL(GREATEST(0, EXTRACT(EPOCH FROM
        GREATEST(available_at, lease_expires_at) - clock_timestamp()) * 1000))::integer AS retry_after_ms
    FROM activitypub_distribution_work_items
    WHERE activity_id = ${activityId}
    FOR UPDATE
  `)
  return rows[0]
}
