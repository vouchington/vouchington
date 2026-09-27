import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import { applyTopicClassifierDecisionVotes } from '@services/classifiers/topic-vote-actions'
import sql from 'sql-template-strings'
import {
  applicationLeaseMatches,
  lockCurrentPostClassifierApplicationInput,
  lockPostClassifierApplication,
  type PostClassifierApplicationLease,
} from './application-identity.mts'
import { readPostClassifierOutcomes } from './application-read.mts'

export async function applyPostClassifierVotes(
  lease: PostClassifierApplicationLease,
  options: { query?: OwnedTransaction } = {},
): Promise<{ appliedTopicIds: readonly string[] }> {
  if (options.query) return applyPostClassifierVotesWithQuery(options.query, lease)
  await using query = await beginTransaction()
  const result = await applyPostClassifierVotesWithQuery(query, lease)
  await query.commit()
  return result
}

async function applyPostClassifierVotesWithQuery(
  query: OwnedTransaction,
  lease: PostClassifierApplicationLease,
): Promise<{ appliedTopicIds: readonly string[] }> {
  if (!(await lockCurrentPostClassifierApplicationInput(query, lease))) {
    throw new Error('post classifier receipt became stale before vote application')
  }
  const row = await lockPostClassifierApplication(query, lease)
  if (!applicationLeaseMatches(row, lease)) {
    throw new Error('post classifier receipt lease is not current for vote application')
  }
  if (!row.outcomes_persisted_at) {
    throw new Error('post classifier outcomes must persist before votes')
  }
  if (row.votes_applied_at) return { appliedTopicIds: [] }

  const recovered = await readPostClassifierOutcomes(lease, { query })
  if (!recovered) throw new Error('post classifier outcomes are not recoverable')
  const appliedTopicIds = recovered.remoteDecision
    ? (
        await applyTopicClassifierDecisionVotes(
          {
            batchId: recovered.remoteDecision.batchId,
            sharedActorId: lease.resolved.configuration.actorId,
            expectedBindings: lease.resolved.configuration.remote!.questions.map(question => ({
              topicId: question.topicId,
              storedCandidateId: question.candidateId,
            })),
          },
          { query },
        )
      ).appliedTopicIds
    : []
  await query(sql`/* markPostClassifierApplicationVotesApplied */
    UPDATE post_classifier_applications
    SET votes_applied_at = clock_timestamp()
    WHERE post_id = ${lease.postId} AND id = ${lease.applicationId}
  `)
  return { appliedTopicIds }
}
