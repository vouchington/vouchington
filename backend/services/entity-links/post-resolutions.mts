import { getPostRouteSegment } from './routes.mts'
import type { PostMention, ResolvedPostMention } from './types.mts'

export function buildResolvedPostMention(
  mention: PostMention,
  entity: unknown,
  rootPostsByCommentId: Map<string, unknown | null>,
): ResolvedPostMention {
  const post = entity as {
    id: string
    title?: string | null
    post_type: string
    slug?: string | null
    root_id?: string | null
  }

  if (post.post_type === 'comment') {
    const rootPost = rootPostsByCommentId.get(post.id) as
      | { id: string; slug?: string | null; title?: string | null; post_type: string }
      | null
      | undefined
    const rootPathId = rootPost?.slug || rootPost?.id || post.root_id || post.id
    const rootRouteType = rootPost
      ? getPostRouteSegment(rootPost.post_type)
      : extractRouteSegmentFromRaw(mention) || getPostRouteSegment('discussion')
    const displayTitle = rootPost?.title?.trim() ? `Comment on ${rootPost.title}` : mention.raw

    return {
      type: 'post',
      raw: mention.raw,
      id: post.id,
      slug: post.slug || post.id,
      title: post.title?.trim() || displayTitle,
      postType: post.post_type,
      url: `/${rootRouteType}/${rootPathId}/comment/${post.id}`,
      displayText: mention.raw,
      displayTitle,
    }
  }

  const slug = post.slug || mention.identifier
  const title = post.title?.trim() || mention.raw

  return {
    type: 'post',
    raw: mention.raw,
    id: post.id,
    slug,
    title,
    postType: post.post_type,
    url: `/${getPostRouteSegment(post.post_type)}/${slug}`,
    displayText: title,
    displayTitle: title,
  }
}

export function isCommentPostEntity(entity: unknown): entity is { post_type: string } {
  if (!entity || typeof entity !== 'object') return false
  return (entity as { post_type?: string }).post_type === 'comment'
}

const POST_DETAIL_SEGMENTS = new Set([
  'discussion',
  'review',
  'data-point',
  'link',
  'article',
  'blog-post',
])

function extractRouteSegmentFromRaw(mention: PostMention): string | null {
  if (mention.source !== 'comment_url') return null
  const raw = mention.raw.replace(/^!/, '')
  try {
    const url = new URL(raw.startsWith('/') ? `https://placeholder${raw}` : raw)
    const segment = url.pathname.split('/').filter(Boolean)[0]
    if (segment && POST_DETAIL_SEGMENTS.has(segment)) return segment
  } catch {
    // invalid URL
  }
  return null
}
