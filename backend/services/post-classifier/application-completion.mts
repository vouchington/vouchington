import { beginTransaction, write, type OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { applyPostClassifierTags } from './application-tags.mts'
import { applyPostClassifierVotes } from './application-votes.mts'
import {
  applicationLeaseMatches,
  lockCurrentPostClassifierApplicationInput,
  lockPostClassifierApplication,
  type PostClassifierApplicationLease,
} from './application-identity.mts'

export type CompletePostClassifierApplicationResult = {
  kind: 'completed' | 'replay' | 'stale'
  appliedTopicIds: readonly string[]
  taggedTopicIds: readonly string[]
}

/**
 * Applies the durable classifier effects in their required order and releases the receipt lease.
 * All effects and the completion marker share one transaction, so a retry can only observe the
 * prior incomplete receipt or the fully completed one.
 */
export async function completePostClassifierApplication(
  lease: PostClassifierApplicationLease,
): Promise<CompletePostClassifierApplicationResult> {
  if (await hasCompletedPostClassifierApplication(lease)) return replay()
  await using query = await beginTransaction()
  if (!(await lockCurrentPostClassifierApplicationInput(query, lease))) return stale()
  const row = await lockPostClassifierApplication(query, lease)
  if (!row) return stale()
  if (row.completed_at) return replay()
  if (!applicationLeaseMatches(row, lease)) return stale()
  if (!row.outcomes_persisted_at) {
    throw new Error('post classifier outcomes must persist before completion')
  }

  const effects = await applyPostClassifierEffects(query, lease)
  await commitPostClassifierCompletion(query, lease)
  return { kind: 'completed', ...effects }
}

async function commitPostClassifierCompletion(
  query: OwnedTransaction,
  lease: PostClassifierApplicationLease,
) {
  await query(sql`/* completePostClassifierApplication */
    UPDATE post_classifier_applications
    SET completed_at = clock_timestamp(),
      lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE post_id = ${lease.postId} AND id = ${lease.applicationId}
  `)
  await query.commit()
}

async function applyPostClassifierEffects(
  query: OwnedTransaction,
  lease: PostClassifierApplicationLease,
) {
  const votes = await applyPostClassifierVotes(lease, { query })
  const tags = await applyPostClassifierTags(lease, { query })
  return {
    appliedTopicIds: votes.appliedTopicIds,
    taggedTopicIds: tags.taggedTopicIds,
  }
}

function stale(): CompletePostClassifierApplicationResult {
  return { kind: 'stale', appliedTopicIds: [], taggedTopicIds: [] }
}

function replay(): CompletePostClassifierApplicationResult {
  return { kind: 'replay', appliedTopicIds: [], taggedTopicIds: [] }
}

async function hasCompletedPostClassifierApplication(
  lease: PostClassifierApplicationLease,
): Promise<boolean> {
  const { rows } = await write<{
    completed: boolean
  }>(sql`/* hasCompletedPostClassifierApplication */
    SELECT completed_at IS NOT NULL AS completed
    FROM post_classifier_applications
    WHERE post_id = ${lease.postId} AND id = ${lease.applicationId}
      AND input_sha256 = ${lease.inputSha256}
      AND configuration_sha256 = ${lease.resolved.configurationSha256}
      AND configuration_json::text = ${lease.resolved.configurationJson}
      AND shared_actor_id = ${lease.resolved.configuration.actorId}
      AND decision_batch_id IS NOT DISTINCT FROM ${lease.decisionBatchId}
  `)
  return rows[0]?.completed ?? false
}
