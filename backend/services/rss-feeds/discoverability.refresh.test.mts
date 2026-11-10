import { afterEach, describe, expect, it, vi } from 'vitest'
import * as psqlEnqueues from '@queues/psql/enqueues'
import {
  beginTransaction,
  createTestUser,
  setRssFeedOwningTopicVoteScore,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { setRssFeedDiscoverabilityAsSystem } from './discoverability.mts'
import { setRssFeedStatesAsCurrentUser } from './set-states-as-current-user.mts'
import { evaluateRssFeedDiscoverability } from './evaluate-discoverability.mts'
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
        is_enabled: false,
        reason: 'test: automatic suppression',
      }),
    ).resolves.toBe('updated')
    expect(refreshTopHashtags).toHaveBeenCalledOnce()

    refreshTopHashtags.mockClear()
    await expect(
      setRssFeedDiscoverabilityAsSystem({
        rssFeedId: feed.id,
        is_enabled: false,
        reason: 'test: unchanged automatic suppression',
      }),
    ).resolves.toBe('noop')
    expect(refreshTopHashtags).not.toHaveBeenCalled()

    const administrator = await createTestUser({ administrator: true })
    await setRssFeedStatesAsCurrentUser(administrator, feed.id, [
      { kind: 'discoverability', is_enabled: true, reason: 'test: human lock' },
    ])
    refreshTopHashtags.mockClear()

    await expect(
      setRssFeedDiscoverabilityAsSystem({
        rssFeedId: feed.id,
        is_enabled: false,
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
          is_enabled: false,
          reason: 'test: transaction-scoped automatic suppression',
        },
        { query },
      ),
    ).resolves.toBe('updated')
    expect(refreshTopHashtags).not.toHaveBeenCalled()
    await query.commit()

    expect(refreshTopHashtags).not.toHaveBeenCalled()
  })
})
