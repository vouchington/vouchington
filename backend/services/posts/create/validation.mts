import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput, PostType } from '../types.mts'
import assert from 'http-assert'
import { assertValidStructuredData } from '@services/data-points'
import { getTopicsByAnyBatch } from '@services/topics/get-batch'
import { getPostContentLimitsConfig } from '@services/post-content-limits'
import { validatePostImageInputs } from '../image-input-validation.mts'
import { assertValidPostAudience } from '../audience.mts'
import { assertValidReviewContent } from '../validate-review-content.mts'
import { assertOfficialAccountCanCreatePost } from '../authorization.mts'
import { getUrlById } from '@services/urls'
import { isUUID } from '@modules/utils'
import { normalizeUrlForUrlTable } from '@modules/utils/urls'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import { assertCanCreateAdminOnlyPostType } from './admin-only-post-type.mts'
import { validatePostCategories } from './validation-categories.mts'

export { validatePostCategories } from './validation-categories.mts'

export type CreatePostDefaults = {
  broadcast: NonNullable<CreatePostInput['broadcast']>
  isAnonymous: boolean
  postType: NonNullable<CreatePostInput['post_type']>
  privacy: NonNullable<CreatePostInput['privacy']>
}

const POST_TYPES = new Set<PostType>([
  'discussion',
  'review',
  'data_point',
  'topic_recommendation',
  'comment',
  'story',
  'link',
  'article',
  'blog_post',
])

export function isSupportedPostType(value: unknown): value is PostType {
  return typeof value === 'string' && POST_TYPES.has(value as PostType)
}

export async function validateCreatePostInput(
  creator: PrivateUser,
  updates: CreatePostInput,
  membershipPlan: ContributionLimitMembershipPlan,
): Promise<CreatePostDefaults> {
  assert(creator, 422, 'Creator is required')
  updates.post_type ||= 'discussion'
  const postType = updates.post_type
  assert(isSupportedPostType(postType), 422, 'Unsupported post_type')
  assert(postType !== 'topic_recommendation', 422, 'Use the dedicated recommendation workflow')
  assert(postType !== 'story', 422, 'Use the dedicated story post creation flow')
  assertCanCreateAdminOnlyPostType(creator, postType)
  if (postType === 'link') {
    assert(
      updates.url_id != null || updates.url != null,
      422,
      'url or url_id is required for link posts',
    )
    if (updates.url_id != null) {
      assert(isUUID(updates.url_id), 422, 'url_id must be a valid UUID')
      const existingUrl = await getUrlById(updates.url_id)
      assert(existingUrl != null, 422, 'url_id does not exist')
    }
    if (updates.url != null) {
      assert(/^https:\/\//i.test(updates.url), 422, 'url must be a valid https URL')
      try {
        normalizeUrlForUrlTable(updates.url)
      } catch {
        assert(false, 422, 'url must be a valid https URL')
      }
    }
  } else {
    assert(updates.url_id == null, 422, 'url_id is only allowed for link posts')
    assert(updates.url == null, 422, 'url is only allowed for link posts')
  }
  assertOfficialAccountCanCreatePost(creator, postType)
  const dataPointTopicIds = await validateStructuredData(updates, postType)
  const defaults = getAudienceDefaults(creator, updates, postType)
  assertValidPostAudience(defaults.broadcast, defaults.privacy)
  if (updates.images?.length) {
    await validatePostImageInputs(
      updates.images,
      creator.id,
      creator.roles.includes('administrator'),
    )
  }
  if (postType === 'review' && !creator.roles.includes('administrator')) {
    assertValidReviewContent(updates.markdown ?? '')
  }
  await validatePostCategories(creator, membershipPlan, updates, { dataPointTopicIds })
  const removedCommunityIds = (updates as { community_ids?: unknown }).community_ids
  assert(removedCommunityIds === undefined, 422, 'community_ids is no longer supported')
  assert(
    updates.declared_language == null || typeof updates.declared_language === 'string',
    422,
    'declared_language must be a string or null',
  )
  return defaults
}

async function validateStructuredData(
  updates: CreatePostInput,
  postType: NonNullable<CreatePostInput['post_type']>,
): Promise<ReadonlySet<string>> {
  if (postType !== 'data_point') {
    assert(
      updates.data_point_vertical === undefined,
      422,
      'data_point_vertical is only allowed for data_point posts',
    )
    assert(
      updates.structured_data === undefined,
      422,
      'structured_data is only allowed for data_point posts',
    )
    return new Set()
  }
  assert(
    typeof updates.data_point_vertical === 'string',
    422,
    'data_point_vertical is required for data_point posts',
  )
  assert(
    updates.structured_data !== undefined,
    422,
    'structured_data is required for data_point posts',
  )
  const { data_point_topic_ids_max_items } = getPostContentLimitsConfig()
  assertValidStructuredData(updates.data_point_vertical, updates.structured_data, {
    topicIdsMaxItems: data_point_topic_ids_max_items,
  })
  const topicIds = (updates.structured_data as { topic_ids: string[] }).topic_ids
  const expectedTopicType = updates.data_point_vertical === 'credit_card' ? 'card' : 'bank_account'
  const topics = await getTopicsByAnyBatch(topicIds)
  for (const [i, topic] of topics.entries()) {
    assert(topic, 422, `Topic not found: ${topicIds[i]}`)
    assert(
      topic.topic_type === expectedTopicType,
      422,
      `Topic must be of type '${expectedTopicType}' for ${updates.data_point_vertical} data points`,
    )
  }

  return new Set(topicIds)
}

function getAudienceDefaults(
  creator: PrivateUser,
  updates: CreatePostInput,
  postType: NonNullable<CreatePostInput['post_type']>,
): CreatePostDefaults {
  let broadcast = updates.broadcast
  let privacy = updates.privacy
  if (postType === 'comment') {
    broadcast = 'everyone'
    privacy = 'public'
  } else if (broadcast === undefined || privacy === undefined) {
    broadcast ??= creator.default_post_broadcast
    privacy ??= creator.default_post_privacy
  }
  return {
    broadcast: broadcast ?? 'everyone',
    isAnonymous: updates.is_anonymous ?? false,
    postType,
    privacy: privacy ?? 'public',
  }
}
