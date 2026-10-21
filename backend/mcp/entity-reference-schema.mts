/** One input description per entity. Tools share these instead of a private id description. */
export const topicReferenceSchema = {
  type: 'string',
  description: 'Topic id, slug, or exact name',
} as const

export const postReferenceSchema = {
  type: 'string',
  description: 'Post id or slug',
} as const

export const rssFeedReferenceSchema = {
  type: 'string',
  description: 'RSS feed id or URL',
} as const

export const communityReferenceSchema = {
  type: 'string',
  description: 'Community id or slug',
} as const

export const userReferenceSchema = {
  type: 'string',
  description: 'User id or username',
} as const
