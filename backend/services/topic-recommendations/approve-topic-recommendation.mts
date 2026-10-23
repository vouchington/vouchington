import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { TopicRecommendationPost } from './types.mts'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { createTopic } from '@services/topics/create'
import { updateTopic } from '@services/topics/update'
import type { EntityRelation } from '@services/entity-relations/upsert-helpers'
import { lockHostnameOwnership } from '@services/urls-hostnames/ownership-lock'
import { prepareUrlHostnamesForOwnedMutation } from '@services/urls-hostnames/upsert'
import { getPostByAny } from '@services/posts'
import assert from 'http-assert'
import { createTopicAliases } from '@services/topics/aliases'
import { createTopicRecommendationRelations } from './create-topic-recommendation-link-relation.mts'
import { assessUrls } from '@services/urls/upsert'
import { getLockedTopicRecommendationApproval } from './get-locked-topic-recommendation-approval.mts'
import { markTopicRecommendationApproved } from './mark-topic-recommendation-approved.mts'
import { setTopicRecommendationApprovalError } from './set-topic-recommendation-approval-error.mts'
import { runApprovedTopicRecommendationSideEffects } from './approve-topic-recommendation-side-effects.mts'
import type { TopicRecommendationApprovalTransactionResult } from './approve-topic-recommendation-types.mts'
export type { TopicRecommendationApprovalTransactionResult } from './approve-topic-recommendation-types.mts'

export async function approveTopicRecommendationInTransaction(
  currentUser: PrivateUser,
  provenance: ContentProvenance,
  recommendationId: string,
  options: { query: TransactionQuery },
): Promise<TopicRecommendationApprovalTransactionResult> {
  const lockedRecommendation = await getLockedTopicRecommendationApproval(recommendationId, options)

  const typedUrls: string[] = []
  if (
    lockedRecommendation.topic_type === 'referral_program' &&
    lockedRecommendation.example_referral_link
  ) {
    typedUrls.push(lockedRecommendation.example_referral_link)
  } else if (lockedRecommendation.topic_type === 'card') {
    typedUrls.push(...lockedRecommendation.landing_page_urls)
  }

  const assessedUrls = await assessUrls([
    ...lockedRecommendation.hostnames.map(hostname => `https://${hostname.hostname}/`),
    ...typedUrls,
  ])
  const typedHostnameIds = await prepareUrlHostnamesForOwnedMutation(
    currentUser.id,
    typedUrls,
    options.query,
  )
  // normalizeUrlForUrlTable and URL.hostname agree on these hostnames, so later
  // materialization reuses this held set instead of acquiring locks after publication.
  await lockHostnameOwnership(options.query, [
    ...lockedRecommendation.hostnames.map(hostname => hostname.id),
    ...typedHostnameIds.values(),
    ...(lockedRecommendation.hostname_id ? [lockedRecommendation.hostname_id] : []),
  ])

  const topic = await createTopic(
    currentUser,
    provenance,
    {
      name: lockedRecommendation.topic_title,
      slug: lockedRecommendation.topic_slug,
      topic_type: lockedRecommendation.topic_type,
      hostname: lockedRecommendation.hostname_id,
    },
    options,
  )

  if (lockedRecommendation.topic_markdown) {
    await updateTopic(
      currentUser,
      topic,
      { markdown: lockedRecommendation.topic_markdown },
      { ...options, skipSideEffects: true },
    )
  }

  if (lockedRecommendation.aliases.length > 0) {
    await createTopicAliases(topic.id, lockedRecommendation.aliases, {
      ...options,
      skipSideEffects: true,
    })
  }

  const relations: EntityRelation[] = []
  const urlIds: string[] = []
  const relationOptions = { ...options, assessedUrls }
  const results = await createTopicRecommendationRelations(
    currentUser,
    topic,
    lockedRecommendation.hostnames,
    relationOptions,
    typedUrls,
  )
  for (const result of results) {
    if (result.relation) relations.push(result.relation)
    if (result.urlId) urlIds.push(result.urlId)
  }

  await markTopicRecommendationApproved(currentUser, recommendationId, topic.id, options)

  return {
    topic,
    aliases: lockedRecommendation.aliases,
    topic_markdown: lockedRecommendation.topic_markdown,
    relations,
    urlIds,
    topic_type: lockedRecommendation.topic_type,
  }
}

export async function approveTopicRecommendation(
  currentUser: PrivateUser,
  provenance: ContentProvenance,
  recommendation: TopicRecommendationPost,
): Promise<{
  recommendation: TopicRecommendationPost
  topic_id: string
  topic_slug: string
  topic_type: 'topic' | 'referral_program' | 'card'
}> {
  assert(currentUser.roles.includes('administrator'), 403, 'Admin access required')
  assert(
    recommendation.topic_recommendation.status === 'pending',
    422,
    'Recommendation is already reviewed',
  )

  try {
    await using query = await beginTransaction()
    const transactionResult = await approveTopicRecommendationInTransaction(
      currentUser,
      provenance,
      recommendation.id,
      { query },
    )
    await query.commit()

    await runApprovedTopicRecommendationSideEffects(
      currentUser,
      recommendation.id,
      transactionResult,
    )

    return {
      recommendation: (await getPostByAny(recommendation.id)) as TopicRecommendationPost,
      topic_id: transactionResult.topic.id,
      topic_slug: transactionResult.topic.slug,
      topic_type: transactionResult.topic_type,
    }
  } catch (err) {
    const message =
      err instanceof Error && err.message.trim().length > 0
        ? err.message.trim()
        : 'Topic approval failed'
    await setTopicRecommendationApprovalError(recommendation.id, message)
    throw err
  }
}
