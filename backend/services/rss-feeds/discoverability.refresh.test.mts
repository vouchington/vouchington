import { afterEach, describe, expect, it, vi } from 'vitest'
import * as psqlEnqueues from '@queues/psql/enqueues'
import {
  beginTransaction,
  createTestUser,
  setRssFeedOwningTopicVoteScore,
} from '@voucha/test-helpers'
import { createTestRssFeed } from './test-fixtures.mts'
import {
  setRssFeedDiscoverabilityAsCurrentUser,
  setRssFeedDiscoverabilityAsSystem,
} from './discoverability.mts'
import { evaluateRssFeedDiscoverability } from './evaluate-discoverability.mts'
import { lockPostPublicationScope } from '@services/post-publication/lock'

describe('RSS feed discoverability top-hashtag refresh', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueues after a direct system update but not a noop or human-locked result', async () => {
    const feed = await createTestRssFeed({})
    const refreshTopHashtags = vi.spyOn(psqlEnqueues, 'enqueueRefreshTopHashtags')

    await expect(
      setRssFeedDiscoverabilityAsSystem({
        rssFeedId: feed.id,
        enabled: false,
        reason: 'test: automatic suppression',
      }),
    ).resolves.toBe('updated')
    expect(refreshTopHashtags).toHaveBeenCalledOnce()

    refreshTopHashtags.mockClear()
    await expect(
      setRssFeedDiscoverabilityAsSystem({
        rssFeedId: feed.id,
        enabled: false,
        reason: 'test: unchanged automatic suppression',
      }),
    ).resolves.toBe('noop')
    expect(refreshTopHashtags).not.toHaveBeenCalled()

    const administrator = await createTestUser({ administrator: true })
    await setRssFeedDiscoverabilityAsCurrentUser(administrator, {
      rssFeedId: feed.id,
      enabled: true,
      reason: 'test: human lock',
    })
    refreshTopHashtags.mockClear()

    await expect(
      setRssFeedDiscoverabilityAsSystem({
        rssFeedId: feed.id,
        enabled: false,
        reason: 'test: automatic suppression after human lock',
      }),
    ).resolves.toBe('skipped:human-locked')
    expect(refreshTopHashtags).not.toHaveBeenCalled()
  })

  it('enqueues when automatic discoverability evaluation changes state', async () => {
    const feed = await createTestRssFeed({})
    await setRssFeedOwningTopicVoteScore(feed.id, 0, 6)
    const refreshTopHashtags = vi.spyOn(psqlEnqueues, 'enqueueRefreshTopHashtags')

    await expect(evaluateRssFeedDiscoverability(feed.id)).resolves.toBe('updated')
    expect(refreshTopHashtags).toHaveBeenCalledOnce()
  })

  it('defers transactional system updates to the outer committed workflow', async () => {
    const feed = await createTestRssFeed({})
    const refreshTopHashtags = vi.spyOn(psqlEnqueues, 'enqueueRefreshTopHashtags')

    await using query = await beginTransaction()
    await expect(
      setRssFeedDiscoverabilityAsSystem(
        {
          rssFeedId: feed.id,
          enabled: false,
          reason: 'test: transaction-scoped automatic suppression',
        },
        { query },
      ),
    ).resolves.toBe('updated')
    expect(refreshTopHashtags).not.toHaveBeenCalled()
    await query.commit()

    expect(refreshTopHashtags).not.toHaveBeenCalled()
  })

  async function assertFeedPublicationLockPrecedesStateRowRead(
    setState: (rssFeedId: string) => Promise<unknown>,
  ): Promise<void> {
    const feed = await createTestRssFeed({})
    const rowLocked = Promise.withResolvers<void>()
    const releaseRow = Promise.withResolvers<void>()
    async function holdDiscoverabilityChangeRow(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* rss feed state publication lock test */
        SELECT 1
        FROM rss_feed_discoverability_changes
        WHERE rss_feed_id = $1::uuid
        FOR UPDATE`,
        [feed.id],
      )
      rowLocked.resolve()
      await releaseRow.promise
      await query.commit()
    }
    const holder = holdDiscoverabilityChangeRow()
    await rowLocked.promise

    const settingState = setState(feed.id)
    try {
      await vi.waitFor(async () => {
        await expect(contendForRssFeedPublicationScope()).rejects.toMatchObject({ code: '55P03' })
      })
    } finally {
      releaseRow.resolve()
    }
    await holder
    await settingState

    async function contendForRssFeedPublicationScope(): Promise<void> {
      await using query = await beginTransaction()
      await query(`/* rss feed state publication lock timeout */ SET LOCAL lock_timeout = '50ms'`)
      await lockPostPublicationScope(query, { type: 'rss_feed', rssFeedId: feed.id })
      await query.commit()
    }
  }

  it('takes the feed publication lock before the current-user discoverability state row', async () => {
    expect.hasAssertions()
    const administrator = await createTestUser({ administrator: true })
    await assertFeedPublicationLockPrecedesStateRowRead(rssFeedId =>
      setRssFeedDiscoverabilityAsCurrentUser(administrator, {
        rssFeedId,
        enabled: false,
        reason: 'test: publication lock order',
      }),
    )
  })

  it('takes the feed publication lock before the system discoverability state row', async () => {
    expect.hasAssertions()
    await assertFeedPublicationLockPrecedesStateRowRead(rssFeedId =>
      setRssFeedDiscoverabilityAsSystem({
        rssFeedId,
        enabled: false,
        reason: 'test: publication lock order',
      }),
    )
  })
})
