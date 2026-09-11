import type {
  LanguageDetectionBackfillJobName,
  LanguageDetectionEntityType,
} from '@queues/language-detection/types'
import {
  detectCommunityLanguageBatch,
  detectTopicLanguageBatch,
  detectUserLanguageBatch,
} from '@services/language-detection/batch-detect-entities'
import {
  detectCrawlLanguageBatch,
  detectPostLanguageBatch,
  detectRssFeedItemLanguageBatch,
} from '@services/language-detection/batch-detect'
import { detectCommunityLanguage } from '@services/language-detection/entities/communities'
import { detectCrawlLanguage } from '@services/language-detection/entities/crawls'
import { detectPostLanguage } from '@services/language-detection/entities/posts'
import { detectRssFeedItemLanguage } from '@services/language-detection/entities/rss-feed-items'
import { detectTopicLanguage } from '@services/language-detection/entities/topics'
import { detectUserLanguage } from '@services/language-detection/entities/users'
import {
  streamCommunitiesNeedingLanguageDetection,
  streamCrawlsNeedingLanguageDetection,
  streamPostsNeedingLanguageDetection,
  streamRssFeedItemsNeedingLanguageDetection,
  streamTopicsNeedingLanguageDetection,
  streamUsersNeedingLanguageDetection,
} from '@services/language-detection/backfill'

export function processLanguageDetection(
  entityType: LanguageDetectionEntityType,
  id: string,
): Promise<void> {
  switch (entityType) {
    case 'post':
      return detectPostLanguage(id)
    case 'rss_feed_item':
      return detectRssFeedItemLanguage(id)
    case 'crawl':
      return detectCrawlLanguage(id)
    case 'community':
      return detectCommunityLanguage(id)
    case 'user':
      return detectUserLanguage(id)
    case 'topic':
      return detectTopicLanguage(id)
    default: {
      const _exhaustive: never = entityType
      throw new Error(`Unknown language detection entity type: ${_exhaustive}`)
    }
  }
}

/**
 * Backfill dispatcher — streams IDs via pg-cursor and batch-detects each page
 * directly using detectLanguageMany (one libuv thread call per batch) instead
 * of enqueueing individual jobs, avoiding queue overhead for large backfills.
 */
export async function processLanguageDetectionBackfill(
  jobName: LanguageDetectionBackfillJobName,
): Promise<{ updated: number }> {
  let updated = 0
  switch (jobName) {
    case 'backfill_posts': {
      for await (const ids of streamPostsNeedingLanguageDetection()) {
        const result = await detectPostLanguageBatch(ids)
        updated += result.updated
      }
      break
    }
    case 'backfill_rss_feed_items': {
      for await (const ids of streamRssFeedItemsNeedingLanguageDetection()) {
        const result = await detectRssFeedItemLanguageBatch(ids)
        updated += result.updated
      }
      break
    }
    case 'backfill_crawls': {
      for await (const ids of streamCrawlsNeedingLanguageDetection()) {
        const result = await detectCrawlLanguageBatch(ids)
        updated += result.updated
      }
      break
    }
    case 'backfill_communities': {
      for await (const ids of streamCommunitiesNeedingLanguageDetection()) {
        const result = await detectCommunityLanguageBatch(ids)
        updated += result.updated
      }
      break
    }
    case 'backfill_users': {
      for await (const ids of streamUsersNeedingLanguageDetection()) {
        const result = await detectUserLanguageBatch(ids)
        updated += result.updated
      }
      break
    }
    case 'backfill_topics': {
      for await (const ids of streamTopicsNeedingLanguageDetection()) {
        const result = await detectTopicLanguageBatch(ids)
        updated += result.updated
      }
      break
    }
    default: {
      const _exhaustive: never = jobName
      throw new Error(`Unknown backfill job: ${_exhaustive}`)
    }
  }
  return { updated }
}
