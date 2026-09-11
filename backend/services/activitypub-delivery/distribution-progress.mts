import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { FOLLOWER_INBOX_BATCH_SIZE, listRemoteFollowerInboxPage } from '@services/remote-actors'
import sql from 'sql-template-strings'

export type PreparedActivityDistributionPage =
  | { status: 'completed' }
  | {
      status: 'ready'
      expectedRemoteActorId: string | null
      nextRemoteActorId: string | null
      inboxUrls: string[]
      hasMore: boolean
    }

type CheckpointRow = {
  source_user_id: string
  last_remote_actor_id: string | null
  completed_at: Date | null
}

type DistributionPageDependencies = {
  listRemoteFollowerInboxPage: typeof listRemoteFollowerInboxPage
}

// Reads a bounded follower page against the primary database after ensuring the activity's durable
// cursor exists. The transaction ends before callers touch Valkey; compare-and-swap advancement
// makes a stale page harmless after another worker commits first.
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
  await query(sql`/* prepareActivityDistributionPage:insert */
      INSERT INTO activitypub_distribution_checkpoints (activity_id, source_user_id)
      VALUES (${activityId}, ${sourceUserId})
      ON CONFLICT (activity_id) DO NOTHING
    `)
  const checkpoint = await getActivityDistributionCheckpoint(activityId, query)
  if (!checkpoint) throw new Error(`Missing ActivityPub distribution checkpoint: ${activityId}`)
  if (checkpoint.source_user_id !== sourceUserId) {
    throw new Error(`ActivityPub distribution source mismatch: ${activityId}`)
  }
  if (checkpoint.completed_at) return { status: 'completed' }

  const candidates = await dependencies.listRemoteFollowerInboxPage(
    sourceUserId,
    checkpoint.last_remote_actor_id,
    FOLLOWER_INBOX_BATCH_SIZE + 1,
    { query },
  )
  const page = candidates.slice(0, FOLLOWER_INBOX_BATCH_SIZE)
  return {
    status: 'ready',
    expectedRemoteActorId: checkpoint.last_remote_actor_id,
    nextRemoteActorId: page.at(-1)?.remoteActorId ?? checkpoint.last_remote_actor_id,
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
): Promise<boolean> {
  const { rowCount } = await write(sql`/* commitActivityDistributionPage */
    UPDATE activitypub_distribution_checkpoints
    SET last_remote_actor_id = ${nextRemoteActorId},
      completed_at = CASE WHEN ${completed} THEN CURRENT_TIMESTAMP ELSE completed_at END
    WHERE activity_id = ${activityId}
      AND source_user_id = ${sourceUserId}
      AND completed_at IS NULL
      AND last_remote_actor_id IS NOT DISTINCT FROM ${expectedRemoteActorId}
  `)
  return rowCount === 1
}

async function getActivityDistributionCheckpoint(
  activityId: string,
  query: TransactionQuery,
): Promise<CheckpointRow | undefined> {
  const { rows } = await query<CheckpointRow>(sql`/* getActivityDistributionCheckpoint */
    SELECT source_user_id, last_remote_actor_id, completed_at
    FROM activitypub_distribution_checkpoints
    WHERE activity_id = ${activityId}
  `)
  return rows[0]
}
