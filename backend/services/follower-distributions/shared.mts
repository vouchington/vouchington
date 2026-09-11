import createError from 'http-errors'

export type DistributionPost = {
  id: string
  created_at: Date
  created_by_id: string | null
  post_type: string
  privacy: string
  broadcast: string
  slug: string | null
  title: string
  markdown: string
}

export function assertDistributablePost(
  post: DistributionPost,
  currentUserId: string,
  verb: 'share' | 'send',
) {
  const pastTense = verb === 'share' ? 'shared' : 'sent'

  if (post.created_by_id === currentUserId) {
    throw createError(400, `You cannot ${verb} your own post`)
  }

  if (post.post_type === 'comment') {
    throw createError(400, `Comments cannot be ${pastTense}`)
  }

  if (post.privacy !== 'public') {
    throw createError(400, `Only public posts can be ${pastTense}`)
  }

  if (post.broadcast !== 'everyone' && post.broadcast !== 'users') {
    throw createError(400, `Only broadly visible posts can be ${pastTense}`)
  }
}

export function getPostRouteSlug(postType: string): string {
  switch (postType) {
    case 'data_point':
      return 'data-points'
    case 'review':
      return 'reviews'
    case 'discussion':
      return 'posts'
    case 'link':
      return 'link'
    default:
      return `${postType}s`
  }
}

export function getPostSendTitle(username: string | null, postType: string): string {
  const actor = username ? `@${username}` : 'Someone'
  const entityType = postType === 'data_point' ? 'data point' : postType
  return `${actor} sent you a ${entityType}`
}

export function truncateText(value: string | null | undefined, maxLength: number): string {
  const text = value ?? ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`
}
