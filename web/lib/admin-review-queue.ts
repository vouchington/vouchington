import type { AdminReviewQueuePost } from '@/types/admin-review-queue'
import { createPostPathname } from '@/lib/links/entity-href'
import { getPostSlugFromType } from '@/lib/route-configs'
import type { PostType } from '@/types/posts'

function reviewQueuePostSlug(postType: string): string {
  switch (postType) {
    case 'review':
    case 'data_point':
    case 'story':
    case 'article':
    case 'blog_post':
    case 'discussion': {
      return getPostSlugFromType(postType satisfies PostType)
    }
    default: {
      return getPostSlugFromType('discussion')
    }
  }
}

function topicRecommendationReviewQueueHref(post: Pick<AdminReviewQueuePost, 'id' | 'title'>) {
  return `/topic-recommendations?q=${encodeURIComponent(post.title || post.id)}`
}

export function getAdminReviewQueuePostHref(post: AdminReviewQueuePost) {
  const identifier = post.slug ?? post.id
  if (post.post_type === 'topic_recommendation') {
    return topicRecommendationReviewQueueHref(post)
  }
  if (post.post_type === 'comment') {
    const rootIdentifier = post.root_slug ?? post.root_id
    if (!rootIdentifier || !post.root_post_type) return createPostPathname('discussion', identifier)
    if (post.root_post_type === 'topic_recommendation') {
      return topicRecommendationReviewQueueHref(post)
    }
    return `${createPostPathname(reviewQueuePostSlug(post.root_post_type), rootIdentifier)}/comment/${post.id}`
  }

  return createPostPathname(reviewQueuePostSlug(post.post_type), identifier)
}
