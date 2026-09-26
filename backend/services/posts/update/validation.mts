import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { assertValidStructuredData } from '@services/data-points'
import { getTopicsByAnyBatch } from '@services/topics/get-batch'
import { getPostContentLimitsConfig } from '@services/post-content-limits'
import { currentUserCanUpdatePost, assertPostContentEditable } from '../authorization.mts'
import { assertValidReviewContent } from '../validate-review-content.mts'
import type { Post, UpdatePostChanges } from '../types.mts'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'
import { isOfficialAccount } from '@services/users'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { assertWithinTagAddLimit } from '@services/tag-limits'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import { validatePostCategories } from '../create/validation.mts'
import { getPostHashtagKeys, getRetainedPostCategories } from '../hashtags.mts'
import { getPostCategoryStandingCount } from './category-standing.mts'
import type { QueryOptions } from '@data-stores/psql/types'

export async function assertValidPostUpdate(
  creator: PrivateUser,
  post: Post,
  changes: UpdatePostChanges,
  membershipPlan: ContributionLimitMembershipPlan = null,
) {
  assertPostUpdatePreflight(creator, post, changes)
  if (
    post.post_type === 'review' &&
    changes.markdown !== undefined &&
    !creator.roles.includes('administrator')
  ) {
    assertValidReviewContent(changes.markdown)
  }
  assert(
    post.post_type !== 'topic_recommendation',
    422,
    'Use the dedicated recommendation workflow',
  )
  if (changes.declared_language !== undefined) {
    assert(
      changes.declared_language === null || typeof changes.declared_language === 'string',
      422,
      'declared_language must be a string or null',
    )
  }
  if (changes.structured_data !== undefined || changes.data_point_vertical !== undefined) {
    await assertValidDataPointUpdate(creator, membershipPlan, post, changes)
  }
}

export function assertPostUpdatePreflight(
  creator: PrivateUser,
  post: Post,
  changes: UpdatePostChanges,
): void {
  assert(currentUserCanUpdatePost(creator, post), 403, 'Forbidden')
  if (changes.ai_summary_markdown !== undefined) {
    assert(
      creator.roles.includes('administrator'),
      403,
      'Only administrators can update ai_summary_markdown',
    )
  }
  if (
    changes.title !== undefined ||
    changes.markdown !== undefined ||
    changes.structured_data !== undefined ||
    changes.categories !== undefined
  ) {
    if (
      isOfficialAccount(creator) &&
      (post.post_type === 'review' || post.post_type === 'data_point')
    ) {
      throw createCodedError(
        403,
        'Official accounts cannot edit community reviews or data points.',
        OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
      )
    }
    assertPostContentEditable(creator, post)
  }
}

export async function assertValidPostCategoryUpdate(
  creator: PrivateUser,
  post: Post,
  changes: UpdatePostChanges,
  membershipPlan: ContributionLimitMembershipPlan,
  options?: QueryOptions,
): Promise<void> {
  if (
    changes.categories !== undefined ||
    changes.title !== undefined ||
    changes.markdown !== undefined ||
    changes.structured_data !== undefined
  ) {
    const retainedCategories = await getRetainedPostCategories(post.id, options)
    const categories = changes.categories ?? retainedCategories
    const finalHashtagKeys = new Set(
      getPostHashtagKeys({
        ...changes,
        title: changes.title ?? post.title,
        markdown: changes.markdown ?? post.markdown,
        categories,
      }),
    )
    const finalTopicIds = getFinalPostCategoryTopicIds(post, changes, categories)
    const existingCategoryCount = await getPostCategoryStandingCount(post.id, options)
    await validatePostCategories(
      creator,
      membershipPlan,
      {
        ...changes,
        title: changes.title ?? post.title,
        markdown: changes.markdown ?? post.markdown,
        categories,
      },
      {
        standingCounts: {
          existing: existingCategoryCount,
          final: finalHashtagKeys.size + finalTopicIds.size,
        },
      },
    )
  }
}

function getFinalPostCategoryTopicIds(
  post: Post,
  changes: UpdatePostChanges,
  categories: NonNullable<UpdatePostChanges['categories']>,
): Set<string> {
  const structuredDataTopicIds =
    post.post_type === 'data_point'
      ? (((changes.structured_data ?? post.structured_data) as { topic_ids?: string[] } | null)
          ?.topic_ids ?? [])
      : []
  return new Set([
    ...structuredDataTopicIds,
    ...categories.flatMap(category => (category.type === 'topic' ? [category.topic_id] : [])),
  ])
}

async function assertValidDataPointUpdate(
  creator: PrivateUser,
  membershipPlan: ContributionLimitMembershipPlan,
  post: Post,
  changes: UpdatePostChanges,
) {
  assert(
    post.post_type === 'data_point',
    422,
    'structured_data can only be updated on data_point posts',
  )
  assert(
    changes.structured_data !== undefined && changes.data_point_vertical !== undefined,
    422,
    'data_point_vertical and structured_data must be updated together',
  )
  const { data_point_topic_ids_max_items } = getPostContentLimitsConfig()
  assertValidStructuredData(changes.data_point_vertical!, changes.structured_data, {
    topicIdsMaxItems: data_point_topic_ids_max_items,
  })

  const topicIds = (changes.structured_data as { topic_ids: string[] }).topic_ids
  const expectedTopicType = changes.data_point_vertical === 'credit_card' ? 'card' : 'bank_account'
  const topics = await getTopicsByAnyBatch(topicIds)
  for (const [i, topic] of topics.entries()) {
    assert(topic, 422, `Topic not found: ${topicIds[i]}`)
    assert(
      topic.topic_type === expectedTopicType,
      422,
      `Topic must be of type '${expectedTopicType}' for ${changes.data_point_vertical} data points`,
    )
  }

  // data_point edits replace the entire topic_ids set rather than adding incrementally, so the
  // limit check must validate the final total against the cap. Passing subjectId=null skips the
  // existing-count query (which would otherwise double-count topics being replaced 1-for-1) and
  // topicIds.length is the post-replacement total, not just the net-new additions.
  const postTopicRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic',
    predicate: 'category',
  })
  await assertWithinTagAddLimit(creator, membershipPlan, postTopicRelation, null, topicIds.length)
}
