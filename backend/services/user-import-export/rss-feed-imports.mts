import type { BasicUser } from '@services/users/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { getPrivateUserByAny } from '@services/users/get'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { getUserImportExportConfig } from './config.mts'
import {
  importSingleRssFeed,
  type ImportRssFeedStatus,
  type ImportSingleRssFeedOptions,
} from './import-rss-feeds.mts'
import { createRssFeedImport, getRssFeedImportRowWithBatch } from './rss-feed-import-records.mts'
import {
  updateRssFeedImportRowCompleted,
  updateRssFeedImportRowFailed,
} from './rss-feed-import-row-updates.mts'
import { getBatchProvenance, type CreateUserRssFeedImportResult } from './rss-feed-import-types.mts'
import { validateRssFeedUrl } from './validate-rss-feed-url.mts'
import { RssFeedDiscoveryPendingError } from '@services/rss-feeds/discovery-pending'
import { getUserActivePlan } from '@services/memberships'
import { assertWithinRssFeedImportDailyLimit } from '@services/contribution-gating/rss-feed-import-limit'
import { withRssFeedImportRowLock } from './rss-feed-import-row-lock.mts'
type CompletedImportRssFeedStatus = Exclude<ImportRssFeedStatus, 'error'>

export { getRssFeedImport, getRssFeedImportSummary } from './rss-feed-import-status.mts'

export async function submitRssFeedImport(
  currentUser: BasicUser,
  provenance: ContentProvenance,
  urls: string[],
  options: { should_follow_imported_feeds?: boolean } = {},
): Promise<CreateUserRssFeedImportResult> {
  const trimmedUrls = urls.flatMap(url => {
    const trimmed = url.trim()
    return trimmed ? [trimmed] : []
  })
  const totalRows = trimmedUrls.length
  if (totalRows === 0) throw new UnrecoverableError('At least one URL is required')

  const should_follow_imported_feeds = options.should_follow_imported_feeds !== false

  return createRssFeedImport(currentUser.id, provenance, trimmedUrls, should_follow_imported_feeds)
}

export async function processRssFeedImportRow(
  importId: string,
  rowId: string,
  options: {
    isFinalAttempt?: boolean
    /** The feed's time budget; defaults to `rss_feed_import_budget_ms`. */
    budgetMs?: number
  } & Pick<ImportSingleRssFeedOptions, 'crawlerRssOptions'> = {},
): Promise<void> {
  return withRssFeedImportRowLock(rowId, () =>
    processLockedRssFeedImportRow(importId, rowId, options),
  )
}

async function processLockedRssFeedImportRow(
  importId: string,
  rowId: string,
  options: {
    isFinalAttempt?: boolean
    budgetMs?: number
  } & Pick<ImportSingleRssFeedOptions, 'crawlerRssOptions'>,
): Promise<void> {
  const { isFinalAttempt = true } = options
  const rowWithBatch = await getRssFeedImportRowWithBatch(rowId)
  if (!rowWithBatch) throw new UnrecoverableError(`RSS feed import row ${rowId} not found`)

  const { batch, row } = rowWithBatch
  if (batch.id !== importId) {
    throw new UnrecoverableError(`RSS feed import row ${rowId} belongs to import ${batch.id}`)
  }

  if (row.completed_at || row.failed_at) return

  const user = await getPrivateUserByAny(batch.user_id)
  if (!user) {
    await updateRssFeedImportRowFailed(row.id, 'Import user not found', { isFinalAttempt: true })
    return
  }

  const validation = validateRssFeedUrl(row.input_url)
  if (!validation.valid) {
    await updateRssFeedImportRowFailed(row.id, validation.error, { isFinalAttempt: true })
    return
  }

  try {
    // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and should_follow_imported_feeds-up side effects
    const membershipPlan = await getUserActivePlan(user.id)
    // The queue job is not the submitting request, so the feeds carry the channel and OAuth client
    // that the batch stored when the request submitted the import.
    const result = await importSingleRssFeed(user, getBatchProvenance(batch), row.input_url, {
      assertRssFeedLimit: () => assertWithinRssFeedImportDailyLimit(user, membershipPlan, row.id),
      follow: batch.should_follow_imported_feeds,
      crawlerRssOptions: options.crawlerRssOptions,
      importRowId: row.id,
      // One deadline covers Web Risk and both protocol attempts. Running out is a plain error, so
      // the job retries it.
      signal: AbortSignal.timeout(
        options.budgetMs ?? getUserImportExportConfig().rss_feed_import_budget_ms,
      ),
    })
    await updateRssFeedImportRowCompleted(
      row.id,
      result.status as CompletedImportRssFeedStatus,
      result.entity_id!,
    )
  } catch (err) {
    if (err instanceof RssFeedDiscoveryPendingError) return
    const message = err instanceof Error ? err.message : String(err)
    const finalFailure = isFinalAttempt || err instanceof UnrecoverableError
    await updateRssFeedImportRowFailed(row.id, message, { isFinalAttempt: finalFailure })
    throw err
  }
}
