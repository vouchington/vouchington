import {
  getHostnameElectionByIdCached,
  getUrlByAnyCached,
  getUrlHostnameByAnyCached,
} from '@services/entity-fetch/get'
import { getRssFeedByIdCached } from '@services/entity-fetch'
import { getRssFeedByArticleUrlId, getRssFeedByUrlId } from '@services/rss-feeds/get'
import { getTopicMetricsByAny } from '@services/topics/metrics'

export type ToolResult =
  | {
      success: true
      hostname: string
      hostname_id: string
      domain_trust: {
        votes_score_net: number
        votes_count_up: number
        votes_count_down: number
      }
      source_topic?: {
        topic_id: string
        topic_slug: string
        topic_title: string
        ratings: {
          count_1: number
          count_2: number
          count_3: number
          count_4: number
          count_5: number
        }
        content_counts: {
          discussions: number
          reviews: number
          data_points: number
          news: number
        }
        followers: number
      }
      rss_feed?: {
        rss_feed_id: string
        title: string
      }
    }
  | {
      success: false
      error: string
    }

export async function getRatingsForUrl(url: string): Promise<ToolResult> {
  const resolvedUrl = await getUrlByAnyCached(url)
  if (!resolvedUrl) {
    let parsedHostname: string
    try {
      parsedHostname = new URL(url).hostname.trim().toLowerCase()
    } catch {
      return { success: false, error: 'Invalid URL.' }
    }
    return getRatingsForHostname(parsedHostname)
  }

  const hostname = resolvedUrl.hostname
  const domainTrust = await getDomainTrust(hostname.id)
  const sourceContext = await getSourceContext(resolvedUrl.id)

  return {
    success: true,
    hostname: hostname.hostname,
    hostname_id: hostname.id,
    domain_trust: domainTrust,
    ...(sourceContext ?? {}),
  }
}

export async function getRatingsForHostname(hostname: string): Promise<ToolResult> {
  const resolvedHostname = await getUrlHostnameByAnyCached(hostname)
  if (!resolvedHostname) {
    return { success: false, error: 'Hostname not found.' }
  }

  return {
    success: true,
    hostname: resolvedHostname.hostname,
    hostname_id: resolvedHostname.id,
    domain_trust: await getDomainTrust(resolvedHostname.id),
  }
}

async function getDomainTrust(hostnameId: string) {
  const election = await getHostnameElectionByIdCached(hostnameId)

  return {
    votes_score_net: election?.votes_score_net ?? 0,
    votes_count_up: election?.votes_count_up ?? 0,
    votes_count_down: election?.votes_count_down ?? 0,
  }
}

async function getSourceContext(urlId: string): Promise<{
  source_topic: {
    topic_id: string
    topic_slug: string
    topic_title: string
    ratings: {
      count_1: number
      count_2: number
      count_3: number
      count_4: number
      count_5: number
    }
    content_counts: {
      discussions: number
      reviews: number
      data_points: number
      news: number
    }
    followers: number
  }
  rss_feed: {
    rss_feed_id: string
    title: string
  }
} | null> {
  const rssFeedId =
    (await getRssFeedByUrlId(urlId))?.id ?? (await getRssFeedByArticleUrlId(urlId))?.id
  if (!rssFeedId) return null

  const rssFeed = await getRssFeedByIdCached(rssFeedId)
  if (!rssFeed) return null

  const topicMetrics = await getTopicMetricsByAny(rssFeed.topic.id)
  if (!topicMetrics) return null

  return {
    source_topic: {
      topic_id: rssFeed.topic.id,
      topic_slug: rssFeed.topic.slug,
      topic_title: rssFeed.topic.name,
      ratings: {
        count_1: topicMetrics.ratings.count['1'],
        count_2: topicMetrics.ratings.count['2'],
        count_3: topicMetrics.ratings.count['3'],
        count_4: topicMetrics.ratings.count['4'],
        count_5: topicMetrics.ratings.count['5'],
      },
      content_counts: {
        discussions: topicMetrics.count.discussions,
        reviews: topicMetrics.count.reviews,
        data_points: topicMetrics.count['data-points'],
        news: topicMetrics.count.news,
      },
      followers: topicMetrics.bookmarks.follow,
    },
    rss_feed: {
      rss_feed_id: rssFeed.id,
      title: rssFeed.title,
    },
  }
}
