import type { Post, CreatePostUpdates } from '@services/posts/types'
import { sha256 } from '@modules/utils'

type PostModerationInput = {
  title: string
  markdown: string
  ai_summary_markdown?: string
  images?: Array<{ image_id: string; order_index: number; caption?: string }>
  structured_data?: unknown
}

/**
 * Extracts user-supplied free-text fields from structured data for moderation/embedding.
 * Only includes fields that accept arbitrary user input (e.g. bonus_requirements).
 */
function getStructuredDataUserText(data: unknown): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ''
  const sd = data as Record<string, unknown>
  const parts: string[] = []
  if (typeof sd.bonus_requirements === 'string') parts.push(sd.bonus_requirements)
  return parts.join('\n')
}

/**
 * Moderation content takes into account text and images
 */
export const createPostModerationContent = (post: PostModerationInput) => {
  const title = post.title || ''
  const markdown = post.markdown || ''
  const images = (post.images ?? []).toSorted((a, b) => a.order_index - b.order_index)
  const image_ids_str = images.map(img => img.image_id).join(',')
  const image_captions = images.flatMap((img, index) => {
    const caption = img.caption?.trim()
    return caption ? [`Image ${index + 1} caption: ${caption}`] : []
  })
  const captions_str = image_captions.join('\n')
  const images_urls: string[] = [] // Image URL resolution for OpenAI moderation is deferred
  const aiSummaryMarkdown = post.ai_summary_markdown ?? ''
  const structuredDataText = getStructuredDataUserText(post.structured_data)
  const contentParts = [title, markdown, aiSummaryMarkdown, image_ids_str, captions_str]
  if (structuredDataText) contentParts.push(structuredDataText)
  const content = contentParts.join('\n')
  return {
    content_sha256: sha256(content),
    texts: [title, markdown, structuredDataText, ...image_captions].filter(text => text.length > 0),
    images_urls,
    image_captions,
    title,
    markdown,
  }
}

/**
 * Text embeddings only take into account text
 */
export const createPostTextEmbeddingContent = (
  post:
    | Post
    | (CreatePostUpdates & {
        topic_title?: string
        topic_slug?: string
        topic_markdown?: string
        topic_hostname?: string
        topic_hostnames?: string[]
        topic_aliases?: string[]
        topic_wikipedia_pageid?: string
      })
    | { title: string; markdown: string; structured_data?: unknown; ai_summary_markdown?: string },
) => {
  const title = post.title || ''
  const markdown = post.markdown || ''
  const aiSummaryMarkdown =
    'ai_summary_markdown' in post && typeof post.ai_summary_markdown === 'string'
      ? post.ai_summary_markdown
      : ''
  const structuredDataText =
    'structured_data' in post ? getStructuredDataUserText(post.structured_data) : ''
  const topicRecommendationContent = createTopicRecommendationEmbeddingContent(post)
  const content = [
    title,
    markdown,
    aiSummaryMarkdown,
    structuredDataText,
    topicRecommendationContent,
  ]
    .filter(Boolean)
    .join('\n')
  return {
    content,
    content_sha256: sha256(content),
  }
}

function createTopicRecommendationEmbeddingContent(
  post:
    | Post
    | (CreatePostUpdates & {
        topic_title?: string
        topic_slug?: string
        topic_markdown?: string
        topic_hostname?: string
        topic_hostnames?: string[]
        topic_aliases?: string[]
        topic_wikipedia_pageid?: string
      })
    | { title: string; markdown: string },
): string {
  const topicTitle =
    'topic_recommendation' in post && post.topic_recommendation
      ? post.topic_recommendation.topic_title
      : 'topic_title' in post
        ? post.topic_title
        : undefined

  const topicSlug =
    'topic_recommendation' in post && post.topic_recommendation
      ? post.topic_recommendation.topic_slug
      : 'topic_slug' in post
        ? post.topic_slug
        : undefined

  const topicMarkdown =
    'topic_recommendation' in post && post.topic_recommendation
      ? (post.topic_recommendation.topic_markdown ?? undefined)
      : 'topic_markdown' in post
        ? post.topic_markdown
        : undefined

  const topicHostname =
    'topic_recommendation' in post && post.topic_recommendation
      ? (post.topic_recommendation.hostname?.hostname ?? undefined)
      : 'topic_hostname' in post
        ? post.topic_hostname
        : undefined

  const topicHostnames =
    'topic_recommendation' in post && post.topic_recommendation
      ? post.topic_recommendation.hostnames.map(hostname => hostname.hostname)
      : 'topic_hostnames' in post
        ? post.topic_hostnames
        : undefined

  const topicAliases =
    'topic_recommendation' in post && post.topic_recommendation
      ? post.topic_recommendation.aliases
      : 'topic_aliases' in post
        ? post.topic_aliases
        : undefined

  const topicWikipediaPageId =
    'topic_recommendation' in post && post.topic_recommendation
      ? (post.topic_recommendation.topic_wikipedia_pageid ?? undefined)
      : 'topic_wikipedia_pageid' in post
        ? post.topic_wikipedia_pageid
        : undefined

  if (
    !topicTitle &&
    !topicSlug &&
    !topicMarkdown &&
    !topicHostname &&
    !topicHostnames?.length &&
    !topicAliases?.length &&
    !topicWikipediaPageId
  ) {
    return ''
  }

  return [
    topicTitle ? `Recommended topic title: ${topicTitle}` : '',
    topicSlug ? `Recommended topic slug: ${topicSlug}` : '',
    topicWikipediaPageId ? `Recommended topic Wikipedia page ID: ${topicWikipediaPageId}` : '',
    topicMarkdown ? `Recommended topic markdown:\n${topicMarkdown}` : '',
    topicAliases?.length ? `Recommended topic aliases: ${topicAliases.join(', ')}` : '',
    topicHostname ? `Recommended primary hostname: ${topicHostname}` : '',
    topicHostnames?.length ? `Recommended hostnames:\n${topicHostnames.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
