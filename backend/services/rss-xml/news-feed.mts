import { searchRssFeedItems } from '@services/rss-feed-items/search'
import { getRssFeedItemByIdCachedBatch } from '@services/entity-fetch'
import { getTopicsByAnyBatch } from '@services/topics/get-batch'
import { searchPrimaryEnabledRssFeedIdsByTopicIds } from '@services/rss-feeds/search-by-topic-ids'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import { sanitizeRssHtml } from '@jongleberry/vurst-html'
import onError from '@modules/on-error'
import { buildRssXml, type RssChannel, type RssItem } from './xml-builder.mts'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import { hasVisibleRssText } from '@modules/utils/rss-text-fields'

export interface NewsFeedOptions {
  topicSlugs?: string[]
  sourceTopicSlugs?: string[]
  categoryTopicSlugs?: string[]
  limit?: number
}

async function buildItemDescription(item: ViewRssFeedItem): Promise<string> {
  const data = item.data
  const fields = [
    data['content:encodedSnippet'],
    data.contentSnippet,
    data.summary,
    data.description,
    data['media:description'],
  ]
  const descriptions = await Promise.all(
    fields.map(async field => {
      if (!field || !hasVisibleRssText(field)) return ''
      const sanitized = await sanitizeNewsFeedDescription(field)
      return hasVisibleRssText(sanitized) ? sanitized : ''
    }),
  )
  return descriptions.find(Boolean) || ''
}

async function sanitizeNewsFeedDescription(raw: string): Promise<string> {
  try {
    const result = await sanitizeRssHtml(Buffer.from(raw, 'utf-8'))
    return result.html.toString('utf-8')
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return ''
  }
}

function buildChannelTitle(topicNames: string[]): string {
  if (topicNames.length > 0) {
    return `${topicNames.join(', ')} - News`
  }
  return 'Latest News'
}

function buildChannelDescription(topicNames: string[]): string {
  if (topicNames.length > 0) {
    return `Recent news in ${topicNames.join(', ')}`
  }
  return 'Recent news'
}

export async function buildNewsFeed(options: NewsFeedOptions): Promise<string> {
  const { topicSlugs, sourceTopicSlugs, categoryTopicSlugs, limit = 25 } = options
  const baseUrl = SITEMAP_CONFIG.BASE_URL

  // Look up topics if topicSlugs provided
  const topicIds: string[] = []
  const topicNames: string[] = []
  if (topicSlugs && topicSlugs.length > 0) {
    const topicLookups = await getTopicsByAnyBatch(topicSlugs)
    for (const topic of topicLookups) {
      if (topic) {
        topicIds.push(topic.id)
        topicNames.push(topic.name)
      }
    }
  }

  // Look up category topics if categoryTopicSlugs provided
  const categoryTopicIds: string[] = []
  if (categoryTopicSlugs && categoryTopicSlugs.length > 0) {
    const categoryTopicLookups = await getTopicsByAnyBatch(categoryTopicSlugs)
    for (const topic of categoryTopicLookups) {
      if (topic) {
        categoryTopicIds.push(topic.id)
        topicNames.push(topic.name)
      }
    }
  }

  // Look up RSS feed IDs from source topic slugs
  const rssFeedIds: string[] = []
  if (sourceTopicSlugs && sourceTopicSlugs.length > 0) {
    const sourceTopicLookups = await getTopicsByAnyBatch(sourceTopicSlugs)
    const sourceTopicIds = sourceTopicLookups.flatMap(t => (t ? [t.id] : []))
    if (sourceTopicIds.length > 0) {
      rssFeedIds.push(...(await searchPrimaryEnabledRssFeedIdsByTopicIds(sourceTopicIds)))
    }
  }

  // Search for RSS feed items
  const { results } = await searchRssFeedItems({
    topic_ids: topicIds.length > 0 ? topicIds : undefined,
    category_topic_ids: categoryTopicIds.length > 0 ? categoryTopicIds : undefined,
    rss_feed_ids: rssFeedIds.length > 0 ? rssFeedIds : undefined,
    limit,
  })

  if (results.length === 0) {
    const channel: RssChannel = {
      title: buildChannelTitle(topicNames),
      link: baseUrl,
      description: buildChannelDescription(topicNames),
      lastBuildDate: new Date(),
    }
    return buildRssXml(channel, [])
  }

  // Fetch full item data
  const itemIds = results.map(r => r.id)
  const items = await getRssFeedItemByIdCachedBatch(itemIds)

  // Map to RSS items — sanitize descriptions concurrently
  const validItems = items.filter(
    (item): item is NonNullable<typeof item> => !!item && !!(item.data.link || item.url?.url),
  )
  const descriptions = await Promise.all(validItems.map(item => buildItemDescription(item)))

  const rssItems: RssItem[] = validItems.map((item, i) => ({
    title: item.data.title || 'Untitled',
    link: item.data.link || item.url?.url || '',
    description: descriptions[i] ?? '',
    pubDate: item.published_at,
    guid: item.data.link || item.url?.url || '',
    categories: item.categories?.map(c => c.category_text) ?? [],
  }))

  const channel: RssChannel = {
    title: buildChannelTitle(topicNames),
    link: baseUrl,
    description: buildChannelDescription(topicNames),
    lastBuildDate: new Date(),
  }

  return buildRssXml(channel, rssItems)
}
