import { beforeAll, describe, expect, it } from 'vitest'
import { createSourceFromUrl } from '@services/rss-feeds/create-source'
import { FeedBudgetExceededError } from '@services/rss-feeds/feed-budget'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getFirstRssFeedImportRowId } from '@voucha/test-helpers/rss-feed-import-rows'
import {
  getRssFeedImport,
  processRssFeedImportRow,
  submitRssFeedImport,
} from './rss-feed-imports.mts'
import type { ImportSingleRssFeedOptions } from './import-rss-feeds.mts'

// The feed fetch never answers, so only the import's own deadline can end the row.
const hangingCreateSource: NonNullable<ImportSingleRssFeedOptions['createSourceFromUrlImpl']> = (
  user,
  provenance,
  url,
  options,
) =>
  createSourceFromUrl(user, provenance, url, {
    ...options,
    fetchAndClassifyFeedImpl: () => new Promise(() => undefined),
  })

// A small injected budget stands in for the 15 second default.
const SMALL_BUDGET_MS = 50

describe('RSS feed import row budget', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  async function submitOneFeed(): Promise<{ importId: string; rowId: string }> {
    const created = await submitRssFeedImport(user, WEB_PROVENANCE, [
      `https://hangs-${crypto.randomUUID()}.example.com/rss`,
    ])
    return {
      importId: created.import.id,
      rowId: await getFirstRssFeedImportRowId(created.import.id),
    }
  }

  it('fails a hanging feed at the budget as a retryable error, leaving the row pending', async () => {
    const { importId, rowId } = await submitOneFeed()

    await expect(
      processRssFeedImportRow(importId, rowId, {
        budgetMs: SMALL_BUDGET_MS,
        isFinalAttempt: false,
        createSourceFromUrlImpl: hangingCreateSource,
      }),
    ).rejects.toBeInstanceOf(FeedBudgetExceededError)

    const status = await getRssFeedImport(user.id, importId)
    expect(status?.import).toMatchObject({ completed_rows: 0, failed_rows: 0, pending_rows: 1 })
    expect(status?.rows[0]).toMatchObject({
      status: 'pending',
      error: 'RSS feed processing exceeded its time budget',
    })
  })

  it('fails the row for good once the last attempt runs out of budget', async () => {
    const { importId, rowId } = await submitOneFeed()

    await expect(
      processRssFeedImportRow(importId, rowId, {
        budgetMs: SMALL_BUDGET_MS,
        isFinalAttempt: true,
        createSourceFromUrlImpl: hangingCreateSource,
      }),
    ).rejects.toBeInstanceOf(FeedBudgetExceededError)

    const status = await getRssFeedImport(user.id, importId)
    expect(status?.import).toMatchObject({ failed_rows: 1, pending_rows: 0 })
    expect(status?.rows[0]?.status).toBe('error')
  })
})
