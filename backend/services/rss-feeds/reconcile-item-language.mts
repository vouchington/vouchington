import { read } from '@data-stores/psql'
import { enqueueBulkLanguageDetection } from '@queues/language-detection/enqueues'
import onError from '@modules/on-error'
import {
  chunkArray,
  RSS_FEED_ITEM_ENQUEUE_BATCH_SIZE,
} from '@services/rss-feed-items/processing-limits'
import { updateRssFeedById } from './update.mts'
import {
  extractFeedTitle,
  extractFeedLanguage,
  extractPodcastShowMetadata,
  extractFeedCategories,
} from './validate.mts'
import { upsertPodcastShow, deletePodcastShow } from './podcast-show.mts'
import { upsertRssFeedCategories, deleteRssFeedCategories } from './categories.mts'
import { createFeedCategoryRelations } from './category-relations.mts'

type ReconcileLanguageDeps = {
  readImpl?: typeof read
  updateRssFeedByIdImpl?: typeof updateRssFeedById
  enqueueBulkLanguageDetectionImpl?: typeof enqueueBulkLanguageDetection
  upsertPodcastShowImpl?: typeof upsertPodcastShow
  deletePodcastShowImpl?: typeof deletePodcastShow
  upsertRssFeedCategoriesImpl?: typeof upsertRssFeedCategories
  deleteRssFeedCategoriesImpl?: typeof deleteRssFeedCategories
  createFeedCategoryRelationsImpl?: typeof createFeedCategoryRelations
}

/**
 * Persists feed metadata (title, declared_language) and, when declared_language
 * changes to a new non-null value, re-enqueues language detection for all
 * existing items so they pick up the authoritative feed language instead of a
 * stale content-detected result.
 *
 * Must be called BEFORE upsertRssFeedItems so language-detection jobs see the
 * updated declared_language.
 */
export async function persistFeedMetadataAndReconcileLanguage(
  rssFeedId: string,
  parsedFeed: Record<string, unknown>,
  oldTitle: string | null,
  oldDeclaredLanguage: string | null,
  oldFeedType: 'article' | 'podcast' | 'video' | 'mixed' | null = null,
  deps: ReconcileLanguageDeps = {},
): Promise<void> {
  const readFn = deps.readImpl ?? read
  const updateRssFeedByIdFn = deps.updateRssFeedByIdImpl ?? updateRssFeedById
  const enqueueBulkLanguageDetectionFn =
    deps.enqueueBulkLanguageDetectionImpl ?? enqueueBulkLanguageDetection
  const upsertPodcastShowFn = deps.upsertPodcastShowImpl ?? upsertPodcastShow
  const deletePodcastShowFn = deps.deletePodcastShowImpl ?? deletePodcastShow
  const upsertRssFeedCategoriesFn = deps.upsertRssFeedCategoriesImpl ?? upsertRssFeedCategories
  const deleteRssFeedCategoriesFn = deps.deleteRssFeedCategoriesImpl ?? deleteRssFeedCategories
  const createFeedCategoryRelationsFn =
    deps.createFeedCategoryRelationsImpl ?? createFeedCategoryRelations
  const metadataUpdates: Parameters<typeof updateRssFeedById>[1] = {}
  if (oldTitle === null) {
    const feedTitle = extractFeedTitle(parsedFeed)
    if (feedTitle) metadataUpdates.title = feedTitle
  }
  // Persist whenever the declared language changed — including being cleared to
  // null (feed dropped <language> / xml:lang or it became unsupported) so a stale
  // value can't linger.
  const declaredLanguage = extractFeedLanguage(parsedFeed)
  if (declaredLanguage !== oldDeclaredLanguage) {
    metadataUpdates.declared_language = declaredLanguage
  }

  // Detect podcast metadata early so feed_type can be set in the same update call,
  // classifying zero-item iTunes feeds before classifyFeedType runs after item upsert.
  // Only set when the current type is unclassified or 'article' — never override a
  // more-specific item-derived type ('video', 'mixed') that was set by a prior crawl,
  // since persistFeedMetadata runs even on unchanged-content crawls where classifyFeedType
  // is skipped, so an unconditional write would permanently flip those feeds to 'podcast'.
  const showMetadata = extractPodcastShowMetadata(parsedFeed)
  if (showMetadata && (oldFeedType == null || oldFeedType === 'article')) {
    metadataUpdates.feed_type = 'podcast'
  }

  if (Object.keys(metadataUpdates).length > 0) {
    await updateRssFeedByIdFn(rssFeedId, metadataUpdates)
  }

  if (showMetadata) {
    await upsertPodcastShowFn(rssFeedId, showMetadata)
    const categories = extractFeedCategories(parsedFeed)
    if (categories.length > 0) {
      await upsertRssFeedCategoriesFn(rssFeedId, categories)
      await createFeedCategoryRelationsFn(rssFeedId)
    } else {
      await deleteRssFeedCategoriesFn(rssFeedId)
    }
  } else {
    await deletePodcastShowFn(rssFeedId)
    await deleteRssFeedCategoriesFn(rssFeedId)
  }

  // Re-enqueue existing items if declared_language changed (upsertRssFeedItems may skip unchanged items).
  void reenqueueItemLanguageDetectionIfNeeded(
    rssFeedId,
    declaredLanguage,
    oldDeclaredLanguage,
    readFn,
    enqueueBulkLanguageDetectionFn,
  ).catch(onError)
}

/**
 * When a feed's declared_language CHANGES — including being set, changed, or
 * cleared to null — re-enqueue language detection for all existing items so they
 * pick up the new authoritative feed language (or fall back to content detection
 * when cleared) instead of a stale result.
 *
 * This path is rare (declared language only changes when the feed XML changes
 * its <language> element), and affected items are submitted in bounded batches.
 */
async function reenqueueItemLanguageDetectionIfNeeded(
  rssFeedId: string,
  declaredLanguage: string | null,
  oldDeclaredLanguage: string | null,
  readFn: typeof read,
  enqueueBulkLanguageDetectionFn: typeof enqueueBulkLanguageDetection,
): Promise<void> {
  if (declaredLanguage === oldDeclaredLanguage) return

  const { rows } = await readFn(
    `/* reenqueueItemLanguageDetectionIfNeeded */
     SELECT s.rss_feed_item_id AS id
     FROM rss_feed_item_sources s
     JOIN rss_feed_items i ON i.id = s.rss_feed_item_id
     WHERE s.rss_feed_id = $1
       AND i.deleted_at IS NULL`,
    [rssFeedId],
  )

  const itemIds = (rows as { id: string }[]).map(row => row.id)
  for (const chunk of chunkArray(itemIds, RSS_FEED_ITEM_ENQUEUE_BATCH_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop -- bounded queue batches are submitted serially so a large feed cannot exceed Valkey request limits.
    await enqueueBulkLanguageDetectionFn('rss_feed_item', chunk).catch(onError)
  }
}
