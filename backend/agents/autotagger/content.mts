import type { Post } from '@services/posts/types'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import { sha256 } from '@modules/utils'
import {
  sanitizePromptInjection,
  sanitizeRssContent,
  wrapExternalContent,
} from '@jongleberry/vurst-prompt'
import {
  sanitizeClassifierExternalContentParts,
  type ClassifierExternalContentPart,
  type ClassifierSafeText,
} from '@agents/classifiers/safe-content'

interface AutotagContent {
  content: string
  content_sha256: Buffer
}

// C7's free-form-reasoning residual path (openai-autotagger.mts). Kept byte-for-byte: C6 never
// calls these, and never will -- see buildPostClassifierState/buildRssFeedItemClassifierState below.
export async function createPostAutotagContent(post: Post): Promise<AutotagContent> {
  const parts: string[] = []

  if (post.title) {
    const sanitizedTitle = await sanitizePromptInjection(post.title, { isTitle: true })
    parts.push(`Title: ${sanitizedTitle}`)
  }

  if (post.markdown) {
    const sanitizedMarkdown = await sanitizePromptInjection(post.markdown)
    parts.push(`Content: ${sanitizedMarkdown}`)
  }

  const rawContent = parts.join('\n\n')

  // Wrap the content to clearly mark it as external data
  const content = wrapExternalContent(rawContent, {
    source: 'post',
    contentType: 'user_post',
  })

  const content_sha256 = sha256(content)

  return {
    content,
    content_sha256,
  }
}

export async function createRssFeedItemAutotagContent(
  item: ViewRssFeedItem,
): Promise<AutotagContent> {
  const parts: string[] = []

  if (item.data.title) {
    const sanitizedTitle = await sanitizePromptInjection(item.data.title, { isTitle: true })
    parts.push(`Title: ${sanitizedTitle}`)
  }

  for (const candidate of [
    { label: 'Content', value: item.data['content:encoded'] },
    { label: 'Content', value: item.data.content },
    { label: 'Description', value: item.data.description },
    { label: 'Summary', value: item.data.summary },
    { label: 'Description', value: item.data['media:description'] },
  ]) {
    if (!candidate.value) continue
    const sanitized = await sanitizeRssContent(candidate.value)
    if (sanitized.trim()) {
      parts.push(`${candidate.label}: ${sanitized}`)
      break
    }
  }

  const rawContent = parts.join('\n\n')

  // Wrap the content to clearly mark it as external data
  const content = wrapExternalContent(rawContent, {
    source: 'rss_feed',
    contentType: item.data.media_type ?? 'article',
  })

  const content_sha256 = sha256(content)

  return {
    content,
    content_sha256,
  }
}

/**
 * C6 state builder for the tagging classifier's post subject. Unlike `createPostAutotagContent`
 * (C7's free-form-reasoning path), this returns a branded `ClassifierSafeText` -- the digest and
 * `executeSingleCallClassifierDecision` both take that type directly, never a plain wrapped
 * string. No field labels are prepended: a single-question noul classifier only needs the raw
 * title/body text, not the "Title:"/"Content:" structure C7's multi-tool free-form prompt wants.
 */
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
 * Selects the RSS body field to use, mirroring `createRssFeedItemAutotagContent`'s trial order
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
