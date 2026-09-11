import type { Post } from '@services/posts/types'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import { sha256 } from '@modules/utils'
import {
  sanitizePromptInjection,
  sanitizeRssContent,
  wrapExternalContent,
} from '@jongleberry/vurst-prompt'

interface AutotagContent {
  content: string
  content_sha256: Buffer
}

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
