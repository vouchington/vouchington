import type { PrivateUser } from '@voucha/types/entities/user'
import { handleElectionVotes } from '@services/entity-relations/upsert-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import onError from '@modules/on-error'
import { enqueueBulkOnUrlCreated, enqueueOnPostUpdated } from '@queues/entity-listeners/enqueues'
import { enqueueTopicAliasesUpdate } from '@queues/topic-aliases/enqueues'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { normalizeKey } from '@ts-shared/utils/strings'
import { invalidate } from '@services/entity-cache/invalidate'
import { finalizeCreatedTopic } from '@services/topics/create'
import { enableReferralProgram } from '@services/topics/referral-programs'
import { updateCardAttributes } from '@services/topics/cards'
import { getRegisteredRecommendationApprovedHandler } from './recommendation-approved-handler-registry.mts'
import type { TopicRecommendationApprovalTransactionResult } from './approve-topic-recommendation.mts'

const landingPageRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'topic',
  objectType: 'url',
  predicate: 'landing_page',
})

async function runBestEffort(effect: () => unknown | Promise<unknown>): Promise<void> {
  try {
    await effect()
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

export async function runApprovedTopicRecommendationSideEffects(
  currentUser: PrivateUser,
  recommendationId: string,
  transactionResult: TopicRecommendationApprovalTransactionResult,
): Promise<void> {
  if (transactionResult.topic_type === 'referral_program') {
    await runBestEffort(() => enableReferralProgram(transactionResult.topic.id))
  } else if (transactionResult.topic_type === 'card') {
    await runBestEffort(() => updateCardAttributes(currentUser, transactionResult.topic, {}))
  }

  await runBestEffort(() =>
    finalizeCreatedTopic(transactionResult.topic, {
      name: transactionResult.topic.name,
      slug: transactionResult.topic.slug,
      markdown: transactionResult.topic_markdown ?? undefined,
      hostname: transactionResult.topic.hostname_id ?? undefined,
      updated_by_id: currentUser.id,
    }),
  )

  if (transactionResult.aliases.length > 0) {
    entityCacheBloomFilters.topics.add(transactionResult.aliases.map(normalizeKey))
  }

  await invalidate.topics(
    transactionResult.topic.id,
    transactionResult.topic.slug,
    ...transactionResult.aliases,
  )
  await invalidate.posts(recommendationId)

  void enqueueOnPostUpdated(recommendationId)

  if (transactionResult.aliases.length > 0) {
    await runBestEffort(async () => {
      await enqueueTopicAliasesUpdate(transactionResult.topic.id)
    })
  }

  await runBestEffort(() =>
    handleElectionVotes(currentUser, landingPageRelation, transactionResult.relations, {
      vote: true,
    }),
  )

  void enqueueBulkOnUrlCreated(transactionResult.urlIds)

  await runBestEffort(() =>
    getRegisteredRecommendationApprovedHandler()(recommendationId, transactionResult.topic.id),
  )
}
