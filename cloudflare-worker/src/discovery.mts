import { VALID_RSS_POST_TYPES, isCatalogValue } from '@ts-shared/feed-capabilities'
import { isPrivateDiscoveryPath } from '@ts-shared/route-classification'

import { getSiteOrigin } from './discovery-origin.mts'
import { appendHeaders } from './proxy.mts'
import type { Env } from './types.mts'

type LinkEntry = {
  href: string
  rel: string
  type?: string
  title?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PUBLIC_TOPIC_SECTION_RE =
  /^\/(bank-account|card|referral-program|rewards-program|rewards-program-status|source|topic)\/([^/]+)\/(posts|reviews|data-points|latest|news)\/?$/
const PUBLIC_USER_PROFILE_RE = /^\/user\/([^/]+)\/?$/

export function addDiscoveryHeaders(response: Response, requestUrl: URL, env: Env): Response {
  const entries = buildDiscoveryLinkEntries(requestUrl, env)
  if (entries.length === 0) return response
  return appendHeaders(response, [['link', formatLinkHeader(entries)]])
}

export function buildDiscoveryLinkEntries(requestUrl: URL, env: Env): LinkEntry[] {
  if (isPrivateDiscoveryPath(requestUrl.pathname) || requestUrl.searchParams.has('apikey')) {
    return []
  }

  const entries = buildSiteLinkEntries(env)
  const routeRssEntry = buildRouteRssLinkEntry(requestUrl)
  if (routeRssEntry) {
    entries.push(routeRssEntry)
  }
  return entries
}

function buildSiteLinkEntries(env: Env): LinkEntry[] {
  const siteOrigin = getSiteOrigin(env)
  const entries = [
    {
      href: `${siteOrigin}/llms.txt`,
      rel: 'service-desc',
      type: 'text/markdown',
      title: 'LLM discovery',
    },
    {
      href: `${siteOrigin}/llms-full.txt`,
      rel: 'service-desc',
      type: 'text/markdown',
      title: 'Full LLM discovery',
    },
    {
      href: `${siteOrigin}/.well-known/api-catalog`,
      rel: 'service-desc',
      type: 'application/linkset+json',
      title: 'API catalog',
    },
    {
      href: `${siteOrigin}/sitemap.xml`,
      rel: 'sitemap',
      type: 'application/xml',
      title: 'Sitemap index',
    },
  ]
  if (env.NOINDEX?.toLowerCase() === 'true') {
    return entries.filter(entry => entry.rel !== 'sitemap')
  }
  return entries
}

function buildRouteRssLinkEntry(requestUrl: URL): LinkEntry | null {
  const topicMatch = requestUrl.pathname.match(PUBLIC_TOPIC_SECTION_RE)
  if (topicMatch) {
    const [, routeKind, topicSlug, section] = topicMatch
    const decodedTopic = decodePathSegment(topicSlug!)
    if (!decodedTopic || UUID_RE.test(decodedTopic)) return null
    const encodedTopic = encodeURIComponent(decodedTopic)
    const href = buildTopicSectionRssHref(
      routeKind!,
      section!,
      encodedTopic,
      requestUrl.searchParams,
    )
    return {
      href,
      rel: 'alternate',
      type: 'application/rss+xml',
      title: 'RSS feed',
    }
  }

  const userMatch = requestUrl.pathname.match(PUBLIC_USER_PROFILE_RE)
  if (userMatch) {
    const decodedUsername = decodePathSegment(userMatch[1]!)
    if (!decodedUsername) return null
    const encodedUsername = encodeURIComponent(decodedUsername)
    return {
      href: `/rss/posts?user=${encodedUsername}`,
      rel: 'alternate',
      type: 'application/rss+xml',
      title: 'RSS feed',
    }
  }

  return null
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function buildTopicSectionRssHref(
  routeKind: string,
  section: string,
  encodedTopic: string,
  searchParams: URLSearchParams,
): string {
  if (section === 'reviews') {
    return `/rss/posts?topics=${encodedTopic}&post_type=review`
  }
  if (section === 'data-points') {
    return `/rss/posts?topics=${encodedTopic}&post_type=data_point`
  }
  if (section === 'latest') {
    const filterName = routeKind === 'source' ? 'sources' : 'topics'
    return `/rss/news?${filterName}=${encodedTopic}`
  }
  if (section === 'news') {
    return `/rss/news?category_topic=${encodedTopic}`
  }

  const rawPostTypes = searchParams.get('post_types')
  if (!rawPostTypes) {
    return `/rss/posts?topics=${encodedTopic}`
  }
  const values = rawPostTypes.split(',').filter(Boolean)
  const firstValue = values[0]
  if (values.length !== 1 || !isCatalogValue(VALID_RSS_POST_TYPES, firstValue)) {
    return `/rss/posts?topics=${encodedTopic}`
  }
  return `/rss/posts?topics=${encodedTopic}&post_type=${encodeURIComponent(firstValue)}`
}

function formatLinkHeader(entries: LinkEntry[]): string {
  return entries.map(formatLinkEntry).join(', ')
}

function formatLinkEntry(entry: LinkEntry): string {
  const parts = [`<${entry.href}>`, `rel="${escapeLinkParameter(entry.rel)}"`]
  if (entry.type) {
    parts.push(`type="${escapeLinkParameter(entry.type)}"`)
  }
  if (entry.title) {
    parts.push(`title="${escapeLinkParameter(entry.title)}"`)
  }
  return parts.join('; ')
}

function escapeLinkParameter(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
