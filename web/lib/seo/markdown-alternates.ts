import { getMarkdownAlternatePath as getSharedMarkdownAlternatePath } from '@vouchington/utils/seo-metadata'

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

const MARKDOWN_PREFIXES = new Set([...POST_PREFIXES, ...TOPIC_PREFIXES, 'user'])

export function getMarkdownAlternatePath(path: string): string | null {
  return getSharedMarkdownAlternatePath(path, MARKDOWN_PREFIXES)
}
