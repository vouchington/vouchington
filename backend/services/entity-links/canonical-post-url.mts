import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import { isSlug, isUUID } from '@modules/utils'
import type { PostMention } from './types.mts'

const PRODUCTION_ORIGIN = 'https://voucha.ai'
const POST_DETAIL_SEGMENTS = new Set([
  'discussion',
  'review',
  'data-point',
  'link',
  'article',
  'blog-post',
])
let cachedBaseUrlValue: string | null = null
let cachedBaseUrl: URL | null = null

export function parseCanonicalPostUrl(
  value: string,
): { identifier: string; source: PostMention['source'] } | null {
  let url: URL
  let baseOrigin: string

  try {
    if (value.startsWith('//')) return null
    const baseUrl = getBaseUrl()
    baseOrigin = baseUrl.origin
    url = value.startsWith('/') ? new URL(value, baseUrl) : new URL(value)
  } catch {
    return null
  }

  if (url.search || url.hash) return null
  if (!isAllowedCanonicalOrigin(url, baseOrigin)) return null

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length === 2 && POST_DETAIL_SEGMENTS.has(segments[0]!)) {
    const identifier = segments[1]!
    if (!isUUID(identifier) && !isSlug(identifier.toLowerCase())) return null
    return {
      identifier: identifier.toLowerCase(),
      source: 'post_url',
    }
  }

  if (
    segments.length === 4 &&
    POST_DETAIL_SEGMENTS.has(segments[0]!) &&
    segments[2] === 'comment'
  ) {
    const commentId = segments[3]!
    const rootIdOrSlug = segments[1]!
    if ((!isUUID(rootIdOrSlug) && !isSlug(rootIdOrSlug.toLowerCase())) || !isUUID(commentId)) {
      return null
    }
    return {
      identifier: commentId.toLowerCase(),
      source: 'comment_url',
    }
  }

  return null
}

function getBaseUrl(): URL {
  const value = SITEMAP_CONFIG.BASE_URL
  if (!cachedBaseUrl || cachedBaseUrlValue !== value) {
    cachedBaseUrl = new URL(value)
    cachedBaseUrlValue = value
  }
  return cachedBaseUrl
}

function isAllowedCanonicalOrigin(url: URL, baseOrigin: string): boolean {
  return url.origin === baseOrigin || url.origin === PRODUCTION_ORIGIN
}
