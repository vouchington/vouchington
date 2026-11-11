import assert from 'http-assert'
import type { TransactionQuery } from '@data-stores/psql'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { PrivateUser } from '@services/users/types'
import { contributionPolicySourceForPostType } from '@services/contribution-gating'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import {
  preparePostWithCommunityReviews,
  prepareLinkPost,
  updatePost,
  deletePost,
  type CreatePostInput,
  type Post,
  type UpdatePostChanges,
} from '@services/posts'
import { assertPostUpdatePreflight } from '@services/posts/update/validation'
import { assertDelegatedPostActorActive } from '@services/posts/authorization'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import { assertStoryIsDiscoverable } from '@services/stories/authorization'
import { prepareStoryPost } from '@services/stories/story-posts'
import {
  updateTopicRecommendation,
  deletePendingRecommendation,
  asTopicRecommendationPost,
  type CreateTopicRecommendationInput,
} from '@services/topic-recommendations'
import { prepareTopicRecommendation } from '@services/topic-recommendations/create-topic-recommendation'

export { validatePostWriteInput } from './input.mts'
export { currentUserCanCreatePostWrite } from './authorization.mts'
import { RECOMMENDATION_FIELDS } from './input.mts'

/** Prepare one admitted post; each domain retains its canonical transactional implementation. */
export async function preparePostWrite(
  currentUser: PrivateUser,
  provenance: ContentProvenance,
  body: CreatePostInput,
  membershipPlan: ContributionLimitMembershipPlan,
  options: { query: TransactionQuery; delegated?: boolean; rssFeedItem?: ViewRssFeedItem },
) {
  if (body.post_type === 'topic_recommendation') {
    if (options.delegated) await assertDelegatedPostActorActive(currentUser.id, options)
    const prepared = await prepareTopicRecommendation(
      currentUser,
      provenance,
      body as CreateTopicRecommendationInput,
      options,
    )
    return {
      response: { post: prepared.response, communityReviews: [] },
      finalize: async () => {
        await prepared.finalize()
        return { post: prepared.response, communityReviews: [] }
      },
    }
  }
  if (body.post_type === 'story') {
    if (options.delegated) await assertDelegatedPostActorActive(currentUser.id, options)
    const prepared = await prepareStoryPost(body.story_id!, currentUser, options)
    return {
      response: { post: prepared.response.post, communityReviews: [] },
      finalize: async () => {
        await prepared.finalize()
        return { post: prepared.response.post, communityReviews: [] }
      },
    }
  }
  if (body.rss_feed_item_id !== undefined) {
    const item = options.rssFeedItem
    assert(item, 404, 'RSS feed item not found')
    return prepareLinkPost(
      currentUser,
      provenance,
      { url_id: item.url.id, title: item.data.title },
      options,
    )
  }
  return preparePostWithCommunityReviews(currentUser, provenance, body, membershipPlan, options)
}

export function assertPostWriteUpdatePreflight(
  currentUser: PrivateUser,
  post: Post,
  changes: UpdatePostChanges,
) {
  if (post.post_type !== 'topic_recommendation')
    assertPostUpdatePreflight(currentUser, post, changes)
}

export async function updatePostWrite(
  currentUser: PrivateUser,
  post: Post,
  changes: UpdatePostChanges,
  membershipPlan: ContributionLimitMembershipPlan,
  delegated = false,
) {
  if (post.post_type === 'topic_recommendation') {
    const recommendation = asTopicRecommendationPost(post)
    assert(recommendation, 404, 'Recommendation not found')
    assert(
      Object.keys(changes).every(
        field =>
          field === 'title' ||
          field === 'markdown' ||
          RECOMMENDATION_FIELDS.includes(field as (typeof RECOMMENDATION_FIELDS)[number]),
      ),
      422,
      'Unsupported topic recommendation change',
    )
    return updateTopicRecommendation(currentUser, recommendation, changes, { delegated })
  }
  assert(
    RECOMMENDATION_FIELDS.every(field => changes[field] === undefined),
    422,
    'Topic recommendation fields require topic_recommendation post_type',
  )
  return updatePost(currentUser, post, changes, membershipPlan, undefined, delegated)
}

export function postWriteAdmission(body: CreatePostInput, isAdmin: boolean) {
  if (body.post_type === 'story')
    return { source: 'story' as const, scope: `story:${body.story_id}` }
  if (body.post_type === 'topic_recommendation')
    return { source: 'topic_recommendation' as const, scope: 'topic_recommendation' }
  if (body.rss_feed_item_id !== undefined)
    return { source: 'rss_item_discussion' as const, scope: `rss_item:${body.rss_feed_item_id}` }
  return {
    source: contributionPolicySourceForPostType(body.post_type, isAdmin),
    scope: body.community_id ? `community:${body.community_id}` : 'global',
  }
}

export async function assertPostWriteBeforeCommit(body: CreatePostInput) {
  if (body.post_type === 'story') await assertStoryIsDiscoverable(body.story_id!)
}

export async function deletePostWrite(
  currentUser: PrivateUser,
  post: Post,
  options?: Parameters<typeof deletePost>[2],
) {
  const recommendation = asTopicRecommendationPost(post)
  if (recommendation)
    return deletePendingRecommendation(currentUser, recommendation, {
      delegated: options?.delegated,
    })
  return deletePost(currentUser, post, options)
}
