import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createSourceFromUrl } from '../create-source.mts'
import { FeedBudgetExceededError } from '../feed-budget.mts'

let user: PrivateUser

const feed = { kind: 'feed', title: 'Budget Feed', feedType: 'article' } as const

function feedUrl(label: string): string {
  return `https://budget-${label}-${Math.random().toString(36).slice(2, 10)}.example.com/feed.xml`
}

describe('createSourceFromUrl budget', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  it('creates no source when the budget is spent before the write starts', async () => {
    const controller = new AbortController()
    let limitChecks = 0

    await expect(
      createSourceFromUrl(user, WEB_PROVENANCE, feedUrl('before'), {
        signal: controller.signal,
        fetchAndClassifyFeedImpl: () => Promise.resolve(feed),
        assertContributionLimit: async () => {
          limitChecks += 1
          controller.abort()
        },
      }),
    ).rejects.toBeInstanceOf(FeedBudgetExceededError)

    expect(limitChecks).toBe(1)
  })

  it('races only the remote work, so a database write is never abandoned by the budget', async () => {
    // A signal double that counts the abort listeners racing the work at any moment.
    const listeners = new Set<unknown>()
    const signal = {
      aborted: false,
      addEventListener: (_type: string, listener: unknown) => listeners.add(listener),
      removeEventListener: (_type: string, listener: unknown) => listeners.delete(listener),
    } as unknown as AbortSignal
    let racingWhenTheWriteStarts = -1
    let racingDuringTheFetch = -1

    const result = await createSourceFromUrl(user, WEB_PROVENANCE, feedUrl('writing'), {
      signal,
      fetchAndClassifyFeedImpl: () => {
        racingDuringTheFetch = listeners.size
        return Promise.resolve(feed)
      },
      assertContributionLimit: async () => {
        racingWhenTheWriteStarts = listeners.size
      },
    })

    expect(racingDuringTheFetch).toBeGreaterThan(0)
    expect(racingWhenTheWriteStarts).toBe(0)
    expect(result.status).toBe('created')
  })

  it('reports a feed that never answers as out of budget', async () => {
    const controller = new AbortController()
    const pending = createSourceFromUrl(user, WEB_PROVENANCE, feedUrl('remote'), {
      signal: controller.signal,
      fetchAndClassifyFeedImpl: () => new Promise<never>(() => undefined),
    })
    controller.abort()

    await expect(pending).rejects.toBeInstanceOf(FeedBudgetExceededError)
  })
})
