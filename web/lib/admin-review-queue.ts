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

function topicRecommendationReviewQueueHref(post: Pick<AdminReviewQueuePost, 'post_label'>) {
  return `/topic-recommendations?q=${encodeURIComponent(post.post_label)}`
}

export function getAdminReviewQueuePostHref(post: AdminReviewQueuePost): string | null {
  if (post.post_type === 'topic_recommendation') {
    return topicRecommendationReviewQueueHref(post)
  }
  if (post.post_type === 'comment') {
    if (post.root_post_type === 'topic_recommendation') {
      return topicRecommendationReviewQueueHref(post)
    }
    if (!post.root_slug || !post.root_post_type) return null
    return `${createPostPathname(reviewQueuePostSlug(post.root_post_type), post.root_slug)}/comment/${post.id}`
  }

  return post.slug ? createPostPathname(reviewQueuePostSlug(post.post_type), post.slug) : null
}
