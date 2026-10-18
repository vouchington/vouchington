import { beforeAll, describe, expect, it } from 'vitest'
import { FeedBudgetExceededError } from '@services/rss-feeds/feed-budget'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getFirstRssFeedImportRowId } from '@voucha/test-helpers/rss-feed-import-rows'
import {
  getRssFeedImport,
  processRssFeedImportRow,
  submitRssFeedImport,
} from './rss-feed-imports.mts'
// The external feed transport waits for the production deadline's abort signal.
const hangingFetchOptions = {
  dependencies: {
    fetchUrl: async ({ signal }: { signal?: AbortSignal }) => {
      if (!signal) throw new Error('RSS fetch did not receive an abort signal')
      return new Promise<never>((_resolve, reject) => {
        const abortError = () => {
          const reason: unknown = signal.reason
          return reason instanceof Error ? reason : new Error(String(reason))
        }
        if (signal.aborted) {
          reject(abortError())
          return
        }
        signal.addEventListener('abort', () => reject(abortError()), { once: true })
      })
    },
  },
}

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
        crawlerRssOptions: hangingFetchOptions,
      }),
    ).rejects.toBeInstanceOf(FeedBudgetExceededError)

    const status = await getRssFeedImport(user.id, importId)
    expect(status?.import).toMatchObject({ completed_rows: 0, failed_rows: 0, pending_rows: 1 })
    expect(status?.rows[0]).toMatchObject({
      status: 'pending',
      error_code: 'FEED_FETCH_TIMEOUT',
    })
  })

  it('fails the row for good once the last attempt runs out of budget', async () => {
    const { importId, rowId } = await submitOneFeed()

    await expect(
      processRssFeedImportRow(importId, rowId, {
        budgetMs: SMALL_BUDGET_MS,
        isFinalAttempt: true,
        crawlerRssOptions: hangingFetchOptions,
      }),
    ).rejects.toBeInstanceOf(FeedBudgetExceededError)

    const status = await getRssFeedImport(user.id, importId)
    expect(status?.import).toMatchObject({ failed_rows: 1, pending_rows: 0 })
    expect(status?.rows[0]).toMatchObject({ status: 'error', error_code: 'FEED_FETCH_TIMEOUT' })
  })
})
