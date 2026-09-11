import type { BasicUser } from '@services/users/types'
import { getPrivateUserByAny } from '@services/users/get'
import { UnrecoverableError } from '@modules/queue-errors'
import {
  importSingleRssFeed,
  type ImportRssFeedStatus,
  type ImportSingleRssFeedOptions,
} from './import-rss-feeds.mts'
import { createRssFeedImport, getRssFeedImportRowWithBatch } from './rss-feed-import-records.mts'
import {
  recordRssFeedImportCanonicalUrl,
  updateRssFeedImportRowCompleted,
  updateRssFeedImportRowFailed,
} from './rss-feed-import-row-updates.mts'
import type { CreateUserRssFeedImportResult } from './rss-feed-import-types.mts'
import { validateRssFeedUrl } from './validate-rss-feed-url.mts'
import { getUserActivePlan } from '@services/memberships'
import { assertWithinContributionDailyLimit } from '@services/contribution-gating/limits'
const MAX_IMPORT_ITEMS = 500
type CompletedImportRssFeedStatus = Exclude<ImportRssFeedStatus, 'error'>

export { getRssFeedImport } from './rss-feed-import-records.mts'

export async function submitRssFeedImport(
  currentUser: BasicUser,
  urls: string[],
  options: { follow?: boolean } = {},
): Promise<CreateUserRssFeedImportResult> {
  const trimmedUrls = urls.flatMap(url => {
    const trimmed = url.trim()
    return trimmed ? [trimmed] : []
  })
  const totalRows = trimmedUrls.length
  if (totalRows === 0) throw new UnrecoverableError('At least one URL is required')
  if (totalRows > MAX_IMPORT_ITEMS) {
    throw new UnrecoverableError(`Maximum ${MAX_IMPORT_ITEMS} URLs per import`)
  }

  const follow = options.follow !== false

  return await createRssFeedImport(currentUser.id, trimmedUrls, follow)
}

export async function processRssFeedImportRow(
  importId: string,
  rowId: string,
  options: { isFinalAttempt?: boolean } & Pick<
    ImportSingleRssFeedOptions,
    'createSourceFromUrlImpl'
  > = {},
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

  await recordRssFeedImportCanonicalUrl(row.id, validation.canonicalUrl)

  try {
    // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
    const membershipPlan = await getUserActivePlan(user.id)
    const result = await importSingleRssFeed(user, row.input_url, {
      assertRssFeedLimit: () =>
        assertWithinContributionDailyLimit(user, membershipPlan, 'rss_feed'),
      follow: batch.follow,
      createSourceFromUrlImpl: options.createSourceFromUrlImpl,
    })
    await updateRssFeedImportRowCompleted(
      row.id,
      result.status as CompletedImportRssFeedStatus,
      result.entity_id!,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const finalFailure = isFinalAttempt || error instanceof UnrecoverableError
    await updateRssFeedImportRowFailed(row.id, message, { isFinalAttempt: finalFailure })
    throw error
  }
}
