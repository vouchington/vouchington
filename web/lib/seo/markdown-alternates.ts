const POST_PREFIXES = new Set([
  'article',
  'blog-post',
  'data-point',
  'discussion',
  'review',
  'story',
])
const TOPIC_PREFIXES = new Set([
  'card',
  'referral-program',
  'rewards-program',
  'rewards-program-status',
  'spending-category',
  'topic',
])

export function getMarkdownAlternatePath(path: string): string | null {
  const parts = path.split('/').filter(Boolean)
  if (parts.length !== 2) return null
  const [prefix, id] = parts
  if (!prefix || !id) return null
  if (POST_PREFIXES.has(prefix) || TOPIC_PREFIXES.has(prefix) || prefix === 'user') {
    return `${path.replace(/\/$/, '')}.md`
  }
  return null
}
