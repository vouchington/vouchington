import type { BasicUser } from '../services/users/types.mts'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { createRssFeedImport } from '../services/user-import-export/rss-feed-import-records.mts'

/**
 * Commits an import batch without enqueuing its dispatcher, so a test drives the rows itself.
 * URLs are stored as given; deduplication and validation belong to the public submit.
 */
export function createRssFeedImportBatchForTest(
  currentUser: BasicUser,
  provenance: ContentProvenance,
  urls: string[],
  options: { should_follow_imported_feeds?: boolean } = {},
) {
  return createRssFeedImport(
    currentUser.id,
    provenance,
    urls,
    options.should_follow_imported_feeds !== false,
  )
}
