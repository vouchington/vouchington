import type { AudienceDefaults } from './types'
import type { Post } from '@/types/posts'
import type { DataPointVertical, StructuredDataState } from '../data-point-fields'
import type { ReviewTopicEntry } from '../post-form-sections'
import type { Topic } from '@/types/topics'

export function getAudienceDefaults({
  post,
  communitySlug,
  communityVisibility,
}: {
  post?: Post
  communitySlug?: string
  communityVisibility?: 'public' | 'private'
}): AudienceDefaults {
  const isCommunityPost = Boolean(communitySlug || post?.community_id)
  const isPrivateCommunityPost = isCommunityPost && communityVisibility === 'private'
  const defaultBroadcast = communityVisibility === 'private' ? 'users' : 'everyone'
  const defaultPrivacy = communityVisibility === 'private' ? 'private' : 'public'
  const initialBroadcast = isPrivateCommunityPost
    ? 'users'
    : isCommunityPost && post?.broadcast && !['everyone', 'users'].includes(post.broadcast)
      ? 'users'
      : (post?.broadcast ?? defaultBroadcast)
  const initialPrivacy =
    isCommunityPost && (isPrivateCommunityPost || initialBroadcast === 'users')
      ? 'private'
      : (post?.privacy ?? defaultPrivacy)

  return {
    initialBroadcast: initialBroadcast,
    initialPrivacy: initialPrivacy,
    isCommunityPost,
    isPrivateCommunityPost,
  }
}

export function toDataPointTopic(
  topic: Topic,
): { id: string; name: string; vertical: DataPointVertical } | undefined {
  if (topic.topic_type === 'card') {
    return { id: topic.id, name: topic.name, vertical: 'credit_card' }
  }
  if (topic.topic_type === 'bank_account') {
    return { id: topic.id, name: topic.name, vertical: 'bank_account' }
  }
  return undefined
}

export function getInitialStructuredData({
  post,
  initialDataPointTopic,
}: {
  post?: Post
  initialDataPointTopic?: { id: string; name: string; vertical: DataPointVertical }
}): StructuredDataState {
  if (post?.structured_data) {
    const base = post.structured_data as StructuredDataState
    if (initialDataPointTopic) {
      return { ...base, topic_name: initialDataPointTopic.name }
    }
    return base
  }
  if (initialDataPointTopic) {
    return { topic_ids: [initialDataPointTopic.id], topic_name: initialDataPointTopic.name }
  }
  return {}
}

export function getInitialReviewTopics({
  post,
  initialReviewTopic,
}: {
  post?: Post
  initialReviewTopic?: { id: string; name: string }
}): ReviewTopicEntry[] {
  if (post?.review_topic_ratings && post.review_topic_ratings.length > 0) {
    return post.review_topic_ratings.map(r => ({
      key: crypto.randomUUID(),
      topicId: r.topic_id,
      topicName: r.topic?.name ?? r.topic_id,
      rating: r.rating,
    }))
  }
  if (initialReviewTopic) {
    return [
      {
        key: crypto.randomUUID(),
        topicId: initialReviewTopic.id,
        topicName: initialReviewTopic.name,
        rating: 0,
      },
    ]
  }
  return [{ key: crypto.randomUUID(), topicId: '', topicName: '', rating: 0 }]
}
