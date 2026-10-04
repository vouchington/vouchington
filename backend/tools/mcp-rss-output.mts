import {
  sanitizePromptInjection,
  sanitizeRssContent,
  wrapExternalContent,
} from '@jongleberry/vurst-prompt'
import type { ViewRssFeed } from '@services/rss-feeds/types'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import { firstVisibleRssTextField } from '@modules/utils'
import { closedObject, pickProperties } from './read-tool-output-schema.mts'

export type McpRssFeed = {
  id: string
  title: string
  feed_type: ViewRssFeed['feed_type']
  is_enabled: boolean
  is_discoverable: boolean
  rss_feed_url: string
}

export type McpRssFeedItem = {
  id: string
  title: string
  markdown: string
  url: string
  guid: string
  published_at: string
  rss_feed_id: string
  rss_feed_title: string
}

export function mcpRssFeedSchema() {
  return closedObject({
    ...pickProperties('ViewRssFeed', ['id', 'title', 'feed_type', 'is_enabled', 'is_discoverable']),
    rss_feed_url: pickProperties('ViewUrl', ['url']).url!,
  })
}

export function mcpRssFeedItemSchema() {
  return closedObject({
    id: pickProperties('ViewRssFeedItem', ['id']).id!,
    title: { type: 'string' },
    markdown: { type: 'string' },
    url: pickProperties('ViewUrl', ['url']).url!,
    guid: pickProperties('ViewRssFeedItem', ['guid']).guid!,
    published_at: pickProperties('ViewRssFeedItem', ['published_at']).published_at!,
    rss_feed_id: pickProperties('ViewRssFeed', ['id']).id!,
    rss_feed_title: pickProperties('ViewRssFeed', ['title']).title!,
  })
}

export async function toMcpRssFeed(feed: ViewRssFeed): Promise<McpRssFeed> {
  return {
    id: feed.id,
    title: wrapExternalContent(await sanitizePromptInjection(feed.title, { isTitle: true }), {
      source: 'rss_feed',
      contentType: 'title',
    }),
    feed_type: feed.feed_type,
    is_enabled: feed.is_enabled,
    is_discoverable: feed.is_discoverable,
    rss_feed_url: feed.rss_feed_url.url,
  }
}

export async function toMcpRssFeedItem(item: ViewRssFeedItem): Promise<McpRssFeedItem> {
  const markdown = firstVisibleRssTextField([
    item.data['content:encoded'],
    item.data['content:encodedSnippet'],
    item.data.content,
    item.data.contentSnippet,
    item.data.summary,
    item.data.description,
    item.data['media:description'],
  ])
  return {
    id: item.id,
    title: wrapExternalContent(
      await sanitizePromptInjection(item.data.title || item.guid, { isTitle: true }),
      { source: 'rss_feed', contentType: 'article_title' },
    ),
    markdown: wrapExternalContent(await sanitizeRssContent(markdown), {
      source: 'rss_feed',
      contentType: 'article',
    }),
    url: item.url.url,
    guid: item.guid,
    published_at: new Date(item.published_at).toISOString(),
    rss_feed_id: item.rss_feed.id,
    rss_feed_title: wrapExternalContent(
      await sanitizePromptInjection(item.rss_feed.title || '', { isTitle: true }),
      { source: 'rss_feed', contentType: 'title' },
    ),
  }
}
