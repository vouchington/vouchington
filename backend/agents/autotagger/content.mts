import type { Post } from '@services/posts/types'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import { sanitizeRssContent } from '@jongleberry/vurst-prompt'
import {
  sanitizeClassifierExternalContentParts,
  type ClassifierExternalContentPart,
  type ClassifierSafeText,
} from '@agents/classifiers/safe-content'

export async function buildPostClassifierState(post: Post): Promise<ClassifierSafeText> {
  const parts: ClassifierExternalContentPart[] = []
  if (post.title) parts.push({ content: post.title, isTitle: true })
  if (post.markdown) parts.push({ content: post.markdown })
  return sanitizeClassifierExternalContentParts(parts, '\n\n', {
    source: 'post',
    contentType: 'user_post',
  })
}

/**
 * Selects the first non-empty RSS body field in priority order
 * (content:encoded, content, description, summary, media:description): sanitize each candidate
 * until one is non-empty, then return that field's *raw* text. The caller re-sanitizes it once,
 * for real, inside `sanitizeClassifierExternalContentParts` -- this lookup only tests emptiness,
 * it never brands or reuses its own output, so there is no double-sanitized value in play.
 */
async function selectRssBodyRawField(item: ViewRssFeedItem): Promise<string | null> {
  const candidates = [
    item.data['content:encoded'],
    item.data.content,
    item.data.description,
    item.data.summary,
    item.data['media:description'],
  ]
  for (const raw of candidates) {
    if (!raw) continue
    const sanitized = await sanitizeRssContent(raw)
    if (sanitized.trim()) return raw
  }
  return null
}

/** C6 state builder for the tagging classifier's RSS feed item subject. See `buildPostClassifierState`. */
export async function buildRssFeedItemClassifierState(
  item: ViewRssFeedItem,
): Promise<ClassifierSafeText> {
  const parts: ClassifierExternalContentPart[] = []
  if (item.data.title) parts.push({ content: item.data.title, isTitle: true })
  const body = await selectRssBodyRawField(item)
  if (body) parts.push({ content: body, isRssHtml: true })
  return sanitizeClassifierExternalContentParts(parts, '\n\n', {
    source: 'rss_feed',
    contentType: item.data.media_type ?? 'article',
  })
}
