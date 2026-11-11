import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput } from '@services/posts'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import { validateCreatePostInput } from '@services/posts/create/validation'
import { currentUserCanCreateStoryPost } from '@services/stories/authorization'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { assertValidCreateTopicRecommendationInput } from '@services/topic-recommendations'

export const RECOMMENDATION_FIELDS = [
  'topic_title',
  'topic_slug',
  'topic_markdown',
  'topic_hostname',
  'topic_hostnames',
  'topic_aliases',
  'topic_type',
  'example_referral_link',
  'landing_page_urls',
] as const

/** Validate every post write entrypoint against the same specialized workflows. */
export async function validatePostWriteInput(
  currentUser: PrivateUser,
  body: CreatePostInput,
  membershipPlan: ContributionLimitMembershipPlan,
) {
  const postType = body.post_type ?? 'discussion'
  assert(
    body.story_id === undefined || postType === 'story',
    422,
    'story_id is only allowed for story posts',
  )
  assert(
    body.rss_feed_item_id === undefined || postType === 'link',
    422,
    'rss_feed_item_id is only allowed for link posts',
  )
  if (postType !== 'topic_recommendation') {
    assert(
      RECOMMENDATION_FIELDS.every(field => body[field] === undefined),
      422,
      'Topic recommendation fields require topic_recommendation post_type',
    )
  }
  if (
    postType === 'story' ||
    postType === 'topic_recommendation' ||
    body.rss_feed_item_id !== undefined
  ) {
    assert(
      body.community_id === undefined &&
        body.parent_post_id === undefined &&
        body.root_post_id === undefined,
      422,
      'This workflow creates a global root post',
    )
    assert(
      body.slug === undefined && body.declared_language === undefined,
      422,
      'Unsupported fields for this post workflow',
    )
    assert(
      body.url === undefined && body.url_id === undefined,
      422,
      'The source determines the post URL',
    )
    assert(
      body.broadcast === undefined && body.privacy === undefined && body.is_anonymous === undefined,
      422,
      'The workflow determines the post audience',
    )
    assert(
      body.images === undefined &&
        body.categories === undefined &&
        body.structured_data === undefined &&
        body.data_point_vertical === undefined &&
        body.review_topic_ratings === undefined,
      422,
      'Unsupported fields for this post workflow',
    )
  }
  if (postType === 'topic_recommendation') {
    assertValidCreateTopicRecommendationInput(body)
    return undefined
  }
  if (postType === 'story') {
    assert(
      body.title === undefined && body.markdown === undefined,
      422,
      'Story source determines the post content',
    )
    assert(
      body.story_id !== undefined && isUUID(body.story_id),
      422,
      'story_id must be a valid UUID',
    )
    assert(currentUserCanCreateStoryPost(currentUser), 403, 'Forbidden')
    return undefined
  }
  if (body.rss_feed_item_id !== undefined) {
    assert(
      body.title === undefined && body.markdown === undefined,
      422,
      'RSS source determines the post content',
    )
    assert(isUUID(body.rss_feed_item_id), 422, 'rss_feed_item_id must be a valid UUID')
    const item = await getRssFeedItemById(body.rss_feed_item_id, { readOnly: false })
    assert(item, 404, 'RSS feed item not found')
    return item
  }
  await validateCreatePostInput(currentUser, body, membershipPlan)
  return undefined
}
