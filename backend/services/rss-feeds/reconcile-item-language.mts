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

/**
 * Persists feed metadata (title, declared_language) and returns whether
 * declared_language changed (set, changed, or cleared). The caller passes that
 * to upsertRssFeedItems so every item in the current XML is re-queued for
 * language detection.
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
): Promise<boolean> {
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
    await updateRssFeedById(rssFeedId, metadataUpdates)
  }

  if (showMetadata) {
    await upsertPodcastShow(rssFeedId, showMetadata)
    const categories = extractFeedCategories(parsedFeed)
    if (categories.length > 0) {
      await upsertRssFeedCategories(rssFeedId, categories)
      await createFeedCategoryRelations(rssFeedId)
    } else {
      await deleteRssFeedCategories(rssFeedId)
    }
  } else {
    await deletePodcastShow(rssFeedId)
    await deleteRssFeedCategories(rssFeedId)
  }

  return declaredLanguage !== oldDeclaredLanguage
}
