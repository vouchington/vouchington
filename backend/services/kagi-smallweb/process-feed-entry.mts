import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { createRssFeedUrlId } from '@services/rss-feeds/rss-feed-url-id'
import { createRssFeedSource } from '@services/rss-feeds/create-source-helpers'
import { findExistingFeedByUrlId } from '@services/rss-feeds/find-existing-feed'
import onError from '@modules/on-error'
import type { ParsedFeedEntry } from './parse.mts'
import { SYSTEM_PROVENANCE } from '@voucha/types/entities/content-provenance'

export type ProcessFeedEntryResult = {
  topicId: string | null
  created: boolean
}

function getHostnameForEntry(entry: ParsedFeedEntry): string {
  if (entry.sourceType === 'youtube') {
    const channelId = new URL(entry.feedUrl).searchParams.get('channel_id')
    if (channelId) return `${channelId.toLowerCase()}.channels.youtube.com`
  }
  return new URL(entry.feedUrl).hostname
}

function getFeedTypeForEntry(entry: ParsedFeedEntry): 'article' | 'video' {
  return entry.sourceType === 'youtube' ? 'video' : 'article'
}

export async function processFeedEntry(entry: ParsedFeedEntry): Promise<ProcessFeedEntryResult> {
  const hostname = getHostnameForEntry(entry)
  const hostnameMap = await upsertUrlHostnames(null, [hostname])
  const normalizedHostname = new URL(`https://${hostname}`).hostname
  const hostnameId = hostnameMap.get(normalizedHostname)
  if (!hostnameId) throw new Error(`Failed to create hostname for ${entry.feedUrl}`)

  const rssFeedUrlId = await createRssFeedUrlId(entry.feedUrl)

  const result = await createRssFeedSource({
    provenance: SYSTEM_PROVENANCE,
    rssFeedUrlId,
    hostnameId,
    topicName: entry.name,
    slug: entry.slug,
    feedTitle: entry.name,
    feedType: getFeedTypeForEntry(entry),
    createdById: null,
  })

  if (!result) {
    const existing = await findExistingFeedByUrlId(rssFeedUrlId)
    if (!existing) {
      onError(
        new Error(
          `Kagi feed slug collision: no feed found by URL for ${entry.feedUrl} (slug: ${entry.slug})`,
        ),
      )
    }
    return { topicId: existing?.topic_id ?? null, created: false }
  }
  return { topicId: result.topicId, created: true }
}
