import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import '@services/elections-votes/entity-relation/register-election-vote-handler'
import { upsertEntityRelation } from '@services/entity-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { mapClassifierProbabilityToTopicVoteScore } from '@services/classifiers/topic-vote-mapper'
import sql from 'sql-template-strings'
import {
  applicationLeaseMatches,
  lockCurrentPostClassifierApplicationInput,
  lockPostClassifierApplication,
  type PostClassifierApplicationLease,
} from './application-identity.mts'
import {
  readPostClassifierOutcomes,
  type PostClassifierRecoveredOutcomes,
} from './application-read.mts'

export async function applyPostClassifierTags(
  lease: PostClassifierApplicationLease,
  options: { query?: OwnedTransaction } = {},
): Promise<{ taggedTopicIds: readonly string[] }> {
  if (options.query) return applyPostClassifierTagsWithQuery(options.query, lease)
  await using query = await beginTransaction()
  const result = await applyPostClassifierTagsWithQuery(query, lease)
  await query.commit()
  return result
}

async function applyPostClassifierTagsWithQuery(
  query: OwnedTransaction,
  lease: PostClassifierApplicationLease,
): Promise<{ taggedTopicIds: readonly string[] }> {
  if (!(await lockCurrentPostClassifierApplicationInput(query, lease))) {
    throw new Error('post classifier receipt became stale before tag application')
  }
  const row = await lockPostClassifierApplication(query, lease)
  if (!applicationLeaseMatches(row, lease)) {
    throw new Error('post classifier receipt lease is not current for tag application')
  }
  if (!row.outcomes_persisted_at) {
    throw new Error('post classifier outcomes must persist before tags')
  }
  if (!row.votes_applied_at) {
    throw new Error('post classifier votes must apply before tags')
  }
  if (row.tags_applied_at) return { taggedTopicIds: [] }

  const recovered = await readPostClassifierOutcomes(lease, { query })
  if (!recovered) throw new Error('post classifier outcomes are not recoverable')
  const taggedTopicIds = getPositiveTopicIds(lease, recovered)
  if (taggedTopicIds.length > 0) {
    await upsertEntityRelation(
      { __entity_type: 'user', id: lease.resolved.configuration.actorId, roles: [] },
      getPostTopicCategoryRelation(),
      { id: lease.postId },
      taggedTopicIds.map(id => ({ id })),
      { query, vote: true, deferNotificationReconcile: true },
    )
  }
  await query(sql`/* markPostClassifierApplicationTagsApplied */
    UPDATE post_classifier_applications
    SET tags_applied_at = clock_timestamp()
    WHERE post_id = ${lease.postId} AND id = ${lease.applicationId}
  `)
  return { taggedTopicIds }
}

function getPositiveTopicIds(
  lease: PostClassifierApplicationLease,
  recovered: PostClassifierRecoveredOutcomes,
): string[] {
  const positiveTopicIds = new Set<string>()
  if (recovered.localOutcome?.flagged) {
    const local = lease.resolved.configuration.local
    if (!local) throw new Error('post classifier receipt local outcome is not configured')
    positiveTopicIds.add(local.topicId)
  }
  for (const result of recovered.remoteDecision?.results ?? []) {
    if (
      result.candidateKind === 'topic' &&
      mapClassifierProbabilityToTopicVoteScore(result.probability, result.effectiveThresholds) === 1
    ) {
      positiveTopicIds.add(result.topicId)
    }
  }
  return [...positiveTopicIds].toSorted()
}

function getPostTopicCategoryRelation() {
  return getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic',
    predicate: 'category',
  })
}
