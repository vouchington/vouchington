import { getFirstRssFeedImportRowId } from '../../backend/test-helpers/rss-feed-import-rows.mts'
import {
  updateRssFeedImportRowCompleted,
  updateRssFeedImportRowFailed,
} from '../../backend/services/user-import-export/rss-feed-import-row-updates.mts'

/** Seed the worker outcome while the browser polls the real authorized status endpoint. */
export async function completeSourceImport(importId: string, feedId: string): Promise<void> {
  const rowId = await getFirstRssFeedImportRowId(importId)
  await updateRssFeedImportRowCompleted(rowId, 'source_created', feedId)
}

/** Seed a terminal worker failure while the browser reads the real authorized status endpoint. */
export async function failSourceImport(importId: string, message: string): Promise<void> {
  const rowId = await getFirstRssFeedImportRowId(importId)
  await updateRssFeedImportRowFailed(rowId, message, { isFinalAttempt: true })
}
