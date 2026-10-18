import { getFirstRssFeedImportRowId } from '../../backend/test-helpers/rss-feed-import-rows.mts'
import { updateRssFeedImportRowCompleted } from '../../backend/services/user-import-export/rss-feed-import-row-updates.mts'

/** Seed the worker outcome while the browser polls the real authorized status endpoint. */
export async function completeSourceImport(importId: string, feedId: string): Promise<void> {
  const rowId = await getFirstRssFeedImportRowId(importId)
  await updateRssFeedImportRowCompleted(rowId, 'source_created', feedId)
}
