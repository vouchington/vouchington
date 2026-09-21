import type { PrivateUser } from '@voucha/types/entities/user'
import type { TopicRecommendationPost } from './types.mts'
import { beginTransaction } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { createTopic } from '@services/topics/create'
import { updateTopic } from '@services/topics/update'
import type { EntityRelation } from '@services/entity-relations/upsert-helpers'
import { getPostByAny } from '@services/posts'
import assert from 'http-assert'
import { createTopicAliases, updateTopicAliasesField } from '@services/topics/aliases'
import { createTopicRecommendationLinkRelation } from './create-topic-recommendation-link-relation.mts'
import { createTopicRecommendationUrlRelation } from './create-topic-recommendation-url-relation.mts'
import { getLockedTopicRecommendationApproval } from './get-locked-topic-recommendation-approval.mts'
import { markTopicRecommendationApproved } from './mark-topic-recommendation-approved.mts'
import { setTopicRecommendationApprovalError } from './set-topic-recommendation-approval-error.mts'
import { runApprovedTopicRecommendationSideEffects } from './approve-topic-recommendation-side-effects.mts'

export type TopicRecommendationApprovalTransactionResult = {
  topic: Awaited<ReturnType<typeof createTopic>>
  aliases: string[]
  topic_markdown: string | null
  relations: EntityRelation[]
  urlIds: string[]
  topic_type: 'topic' | 'referral_program' | 'card'
}

export async function approveTopicRecommendationInTransaction(
  currentUser: PrivateUser,
  recommendationId: string,
  options: { query: NonNullable<QueryOptions['query']> },
): Promise<TopicRecommendationApprovalTransactionResult> {
  const lockedRecommendation = await getLockedTopicRecommendationApproval(recommendationId, options)

  const topic = await createTopic(
    currentUser,
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
    await updateTopicAliasesField(topic.id, { ...options, skipSideEffects: true })
  }

  const relations: EntityRelation[] = []
  const urlIds: string[] = []

  for (const hostname of lockedRecommendation.hostnames) {
    // oxlint-disable-next-line no-await-in-loop -- URL creation and relation insertion share this transaction-scoped query
    const relationResult = await createTopicRecommendationLinkRelation(
      currentUser,
      topic,
      hostname,
      options,
    )
    if (relationResult.relation) relations.push(relationResult.relation)
    if (relationResult.urlId) urlIds.push(relationResult.urlId)
  }

  const typedUrls: string[] = []
  if (
    lockedRecommendation.topic_type === 'referral_program' &&
    lockedRecommendation.example_referral_link
  ) {
    typedUrls.push(lockedRecommendation.example_referral_link)
  } else if (lockedRecommendation.topic_type === 'card') {
    typedUrls.push(...lockedRecommendation.landing_page_urls)
  }

  for (const url of typedUrls) {
    // oxlint-disable-next-line no-await-in-loop -- typed URL relations must be inserted in order on the shared transaction
    const result = await createTopicRecommendationUrlRelation(currentUser, topic, url, options)
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
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : 'Topic approval failed'
    await setTopicRecommendationApprovalError(recommendation.id, message)
    throw error
  }
}
