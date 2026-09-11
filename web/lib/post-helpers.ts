import type { PostResponseBody } from '@/types/api-responses'
import type { Post, PostType } from '@/types/posts'

// `comment` requires root-post context (see backend/services/posts/CLAUDE.md).
type RoutablePostType = Exclude<PostType, 'comment'>

const POST_TYPE_PATHS: Record<RoutablePostType, string> = {
  discussion: 'discussion',
  review: 'review',
  data_point: 'data-point',
  topic_recommendation: 'topic-recommendations',
  story: 'discussion',
  article: 'article',
  blog_post: 'blog-post',
  link: 'link',
}

export function getPostTypePath(postType: PostType): string {
  if (postType === 'comment') {
    throw new Error('Comment routes require root post context')
  }
  return POST_TYPE_PATHS[postType]
}

function getPostPathSegment(post: Pick<Post, 'id' | 'slug'>): string {
  return post.slug?.length ? post.slug : post.id
}

export function getCanonicalPostPath(post: Pick<Post, 'id' | 'post_type' | 'slug'>): string {
  return `/${getPostTypePath(post.post_type)}/${getPostPathSegment(post)}`
}

export function getPostPath(slug: string, post: Post): string {
  return `/${slug}/${getPostPathSegment(post)}`
}

export function getPostTitle(post: Post): string {
  if (post.title) return post.title

  switch (post.post_type) {
    case 'review': {
      return 'Untitled Review'
    }
    case 'data_point': {
      return 'Untitled Data Point'
    }
    case 'comment': {
      return 'Untitled Comment'
    }
    case 'link': {
      return 'Untitled Link'
    }
    default: {
      return 'Untitled Discussion'
    }
  }
}

export function getPostCollectionLabel(slug: string): string {
  switch (slug) {
    case 'review': {
      return 'Reviews'
    }
    case 'data-point': {
      return 'Data Points'
    }
    case 'article': {
      return 'Articles'
    }
    case 'blog-post': {
      return 'Blog Posts'
    }
    case 'story': {
      return 'Stories'
    }
    case 'link': {
      return 'Links'
    }
    default: {
      return 'Discussions'
    }
  }
}

export function getPostCollectionPath(slug: string): string {
  switch (slug) {
    case 'review': {
      return '/reviews'
    }
    case 'data-point': {
      return '/data-points'
    }
    case 'article': {
      return '/articles'
    }
    case 'blog-post': {
      return '/blog'
    }
    case 'story': {
      return '/stories'
    }
    case 'link': {
      return '/links'
    }
    default: {
      return '/discussions'
    }
  }
}

export function getVoteScoreNet(data: PostResponseBody): number | null {
  const election = data.post_election
  if (!election) return null
  return election.votes_count_up - election.votes_count_down
}

export function getPostSchemaKind(slug: string) {
  switch (slug) {
    case 'review': {
      return 'review' as const
    }
    case 'article': {
      return 'article' as const
    }
    case 'blog-post': {
      return 'blog-post' as const
    }
    case 'data-point': {
      return 'data-point' as const
    }
    case 'link': {
      return 'article' as const
    }
    default: {
      return 'discussion' as const
    }
  }
}
