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

  it('finishes the write instead of abandoning it when the budget runs out during it', async () => {
    const controller = new AbortController()

    const result = await createSourceFromUrl(user, WEB_PROVENANCE, feedUrl('during'), {
      signal: controller.signal,
      fetchAndClassifyFeedImpl: () => Promise.resolve(feed),
      // The abort lands on a later turn of the event loop, while the database write awaits I/O.
      assertContributionLimit: async () => {
        setImmediate(() => controller.abort())
      },
    })

    expect(controller.signal.aborted).toBe(true)
    expect(result.status).toBe('created')
    expect(result.rss_feed_id).toBeDefined()
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
