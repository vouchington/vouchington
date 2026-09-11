const POST_DETAIL_PREFIXES = new Map([
  ['article', 'article'],
  ['blog-post', 'blog_post'],
  ['data-point', 'data_point'],
  ['discussion', 'discussion'],
  ['review', 'review'],
  ['story', 'story'],
])

const TOPIC_DETAIL_PREFIXES = new Map([
  ['bank-account', 'bank_account'],
  ['card', 'card'],
  ['referral-program', 'referral_program'],
  ['rewards-program', 'rewards_program'],
  ['rewards-program-status', 'rewards_program_status'],
  ['source', 'rss_feed'],
  ['topic', 'topic'],
])

const LIST_ALIASES = new Map([
  ['/posts.md', '/md/posts'],
  ['/articles.md', '/md/posts?post_types=article'],
  ['/blog.md', '/md/posts?post_types=blog_post'],
  ['/data-points.md', '/md/posts?post_types=data_point'],
  ['/discussions.md', '/md/posts?post_types=discussion'],
  ['/reviews.md', '/md/posts?post_types=review'],
  ['/stories.md', '/md/posts?post_types=story'],
  ['/topics.md', '/md/topics'],
])

const stripMarkdownExtension = (segment: string): string | null =>
  segment.endsWith('.md') && segment.length > 3 ? segment.slice(0, -3) : null

const isSafeMarkdownAliasId = (id: string): boolean => id !== '.' && id !== '..'

export function getMarkdownAliasOriginPath(pathname: string): string | null {
  const listAlias = LIST_ALIASES.get(pathname)
  if (listAlias) return listAlias

  const parts = pathname.split('/').filter(Boolean)
  if (parts.length !== 2) return null

  const [prefix, rawId] = parts
  if (!prefix || !rawId) return null
  const id = stripMarkdownExtension(rawId)
  if (!id) return null
  if (!isSafeMarkdownAliasId(id)) return null

  const postType = POST_DETAIL_PREFIXES.get(prefix)
  if (postType) {
    return `/md/posts/${encodeURIComponent(id)}?post_types=${encodeURIComponent(postType)}`
  }
  const topicType = TOPIC_DETAIL_PREFIXES.get(prefix)
  if (topicType) {
    return `/md/topics/${encodeURIComponent(id)}?topic_types=${encodeURIComponent(topicType)}`
  }
  if (prefix === 'user') {
    return `/md/users/${encodeURIComponent(id)}`
  }

  return null
}

export const isMarkdownAliasRoute = (pathname: string): boolean =>
  getMarkdownAliasOriginPath(pathname) !== null
