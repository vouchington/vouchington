import {
  sanitizeClassifierExternalContentParts,
  type ClassifierExternalContentPart,
  type ClassifierSafeText,
} from '@agents/classifiers/safe-content'
import { createPostModerationContent } from '@services/posts/content'
import type { Post } from '@services/posts/types'

/**
 * The post text the moderation digest covers (title, body, structured free text and image
 * captions), sanitized as untrusted content: what every community rule is asked about.
 */
export async function buildCommunityModerationState(post: Post): Promise<ClassifierSafeText> {
  const { title, markdown, texts } = createPostModerationContent(post)
  const parts: ClassifierExternalContentPart[] = []
  if (title) parts.push({ content: title, isTitle: true })
  if (markdown) parts.push({ content: markdown })
  // `texts` is [title, markdown, structured free text, ...captions] without its empty entries.
  for (const content of texts.slice(parts.length)) parts.push({ content })
  return sanitizeClassifierExternalContentParts(parts, '\n\n', {
    source: 'post',
    contentType: 'user_post',
  })
}
