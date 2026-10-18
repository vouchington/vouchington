import type {
  LanguageDetectionBackfillCursor,
  LanguageDetectionBackfillJobName,
  LanguageDetectionEntityType,
} from '@queues/content-analysis/types'
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
import { getLanguageDetectionWorkLimit } from '@services/language-detection/work-limits'

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
 * Each retained pass reads at most the configured number of IDs. Save the keyset cursor after
 * every successful batch so a worker restart can resume without replaying the entire table.
 */
export async function processLanguageDetectionBackfill(
  jobName: LanguageDetectionBackfillJobName,
  entityIds?: readonly string[],
  savedCursor?: LanguageDetectionBackfillCursor,
  saveProgress: (cursor: LanguageDetectionBackfillCursor) => Promise<void> = async () => undefined,
): Promise<{ updated: number; hasMore: boolean }> {
  assertKnownLanguageDetectionBackfillJob(jobName)
  if (entityIds?.length === 0) return { updated: 0, hasMore: false }
  const cursor: LanguageDetectionBackfillCursor = savedCursor
    ? { ...savedCursor }
    : {
        sweepStartedAt: new Date().toISOString(),
      }
  if (!savedCursor) await saveProgress(cursor)
  const maxRows = getLanguageDetectionWorkLimit('backfill_max_rows_per_run')
  let read = 0
  let updated = 0
  const consume = async (
    batches: AsyncGenerator<string[], void, unknown>,
    detect: (ids: string[]) => Promise<{ updated: number }>,
  ) => {
    for await (const ids of batches) {
      const result = await detect(ids)
      updated += result.updated
      read += ids.length
      cursor.afterId = ids.at(-1)!
      await saveProgress(cursor)
    }
  }
  switch (jobName) {
    case 'backfill_posts': {
      await consume(
        streamPostsNeedingLanguageDetection(
          entityIds,
          cursor.afterId,
          maxRows,
          cursor.sweepStartedAt,
        ),
        detectPostLanguageBatch,
      )
      break
    }
    case 'backfill_rss_feed_items': {
      await consume(
        streamRssFeedItemsNeedingLanguageDetection(
          entityIds,
          cursor.afterId,
          maxRows,
          cursor.sweepStartedAt,
        ),
        detectRssFeedItemLanguageBatch,
      )
      break
    }
    case 'backfill_crawls': {
      await consume(
        streamCrawlsNeedingLanguageDetection(
          entityIds,
          cursor.afterId,
          maxRows,
          cursor.sweepStartedAt,
        ),
        detectCrawlLanguageBatch,
      )
      break
    }
    case 'backfill_communities': {
      await consume(
        streamCommunitiesNeedingLanguageDetection(
          entityIds,
          cursor.afterId,
          maxRows,
          cursor.sweepStartedAt,
        ),
        detectCommunityLanguageBatch,
      )
      break
    }
    case 'backfill_users': {
      await consume(
        streamUsersNeedingLanguageDetection(
          entityIds,
          cursor.afterId,
          maxRows,
          cursor.sweepStartedAt,
        ),
        detectUserLanguageBatch,
      )
      break
    }
    case 'backfill_topics': {
      await consume(
        streamTopicsNeedingLanguageDetection(
          entityIds,
          cursor.afterId,
          maxRows,
          cursor.sweepStartedAt,
        ),
        detectTopicLanguageBatch,
      )
      break
    }
    default: {
      const _exhaustive: never = jobName
      throw new Error(`Unknown backfill job: ${_exhaustive}`)
    }
  }
  // An exactly full page may have no successor; one empty retained pass closes the sweep.
  return { updated, hasMore: read === maxRows }
}

function assertKnownLanguageDetectionBackfillJob(jobName: LanguageDetectionBackfillJobName): void {
  switch (jobName) {
    case 'backfill_posts':
    case 'backfill_rss_feed_items':
    case 'backfill_crawls':
    case 'backfill_communities':
    case 'backfill_users':
    case 'backfill_topics':
      return
    default: {
      const _exhaustive: never = jobName
      throw new Error(`Unknown backfill job: ${_exhaustive}`)
    }
  }
}
