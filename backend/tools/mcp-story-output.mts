import {
  sanitizePromptInjection,
  sanitizeRssContent,
  wrapExternalContent,
} from '@jongleberry/vurst-prompt'
import { firstVisibleRssTextField } from '@modules/utils'
import type { getRssFeedItemByIdCachedBatch } from '@services/entity-fetch'
import type { getStoryById } from '@services/feeds/rss-feed-items/get-story-by-id'
import { closedObject, pickProperties } from './read-tool-output-schema.mts'

type StoryRow = NonNullable<Awaited<ReturnType<typeof getStoryById>>>
type RssItem = NonNullable<Awaited<ReturnType<typeof getRssFeedItemByIdCachedBatch>>[number]>

const STORY_FIELDS = [
  'id',
  'title',
  'cluster_reason',
  'published_at',
  'official_rss_feed_item_id',
  'created_at',
  'updated_at',
] as const

export type McpStory = {
  id: string
  title: string | null
  cluster_reason: string | null
  published_at: string | null
  official_rss_feed_item_id: string | null
  created_at: string
  updated_at: string
}

export type McpStoryItem = {
  id: string
  title: string
  markdown: string
  url: string
  guid: string
  published_at: string
  rss_feed_id: string
  rss_feed_title: string
}

/** The published schema of an `McpStory`, from the generated `Story` contract. */
export function mcpStorySchema() {
  return closedObject(pickProperties('Story', STORY_FIELDS))
}

/**
 * The published schema of an `McpStoryItem`. The ids, guid, URL and dates come from the generated
 * RSS item contract; the title and markdown are sanitized text the tool builds itself.
 */
export function mcpStoryItemSchema() {
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

/** A story with its LLM-written title and grouping reason sanitized like any external text. */
export async function toMcpStory(story: StoryRow): Promise<McpStory> {
  return {
    id: story.id,
    title: story.title ? await sanitizePromptInjection(story.title, { isTitle: true }) : null,
    cluster_reason: story.cluster_reason
      ? wrapExternalContent(await sanitizePromptInjection(story.cluster_reason), {
          source: 'story',
          contentType: 'cluster_reason',
        })
      : null,
    published_at: story.published_at ? new Date(story.published_at).toISOString() : null,
    official_rss_feed_item_id: story.official_rss_feed_item_id,
    created_at: new Date(story.created_at).toISOString(),
    updated_at: new Date(story.updated_at).toISOString(),
  }
}

/** A story member article, shaped and sanitized like the `search_rss_feed_items` results. */
export async function toMcpStoryItem(item: RssItem): Promise<McpStoryItem> {
  return {
    id: item.id,
    title: await sanitizePromptInjection(item.data.title || item.guid, { isTitle: true }),
    markdown: wrapExternalContent(await sanitizeRssContent(rssItemContent(item.data)), {
      source: 'rss_feed',
      contentType: 'article',
    }),
    url: item.url.url,
    guid: item.guid,
    published_at: new Date(item.published_at).toISOString(),
    rss_feed_id: item.rss_feed.id,
    rss_feed_title: await sanitizePromptInjection(item.rss_feed.title || '', { isTitle: true }),
  }
}

function rssItemContent(data: RssItem['data']): string {
  return firstVisibleRssTextField([
    data['content:encoded'],
    data['content:encodedSnippet'],
    data.content,
    data.contentSnippet,
    data.summary,
    data.description,
    data['media:description'],
  ])
}
