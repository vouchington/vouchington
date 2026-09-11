import { createHash, randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
import {
  assertRssFeedItemIsDiscoverable,
  assertStoryIsDiscoverable,
  currentUserCanCreateStoryPost,
} from './authorization.mts'
import { setRssFeedDiscoverabilityAsSystem } from '@services/rss-feeds/discoverability'
import { FEED_NOT_DISCOVERABLE } from '@modules/on-error/error-codes'
import {
  createTestUrlWithHostname,
  insertTestRssFeedItem,
  insertTestStory,
  setTestItemStoryId,
  observeTestPostgresQueryPools,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import type { PrivateUser } from '@services/users/types'

describe('authorization', () => {
  function sha256(data: unknown): Buffer {
    return createHash('sha256').update(JSON.stringify(data)).digest()
  }

  let urlId: string
  let discoverableFeedId: string
  let nonDiscoverableFeedId: string

  beforeAll(async () => {
    ;[urlId, discoverableFeedId, nonDiscoverableFeedId] = await Promise.all([
      createTestUrlWithHostname(),
      createTestRssFeed({}).then(f => f.id),
      createTestRssFeed({}).then(async f => {
        await setRssFeedDiscoverabilityAsSystem({
          rssFeedId: f.id,
          enabled: false,
          reason: 'authorization.test fixture',
        })
        return f.id
      }),
    ])
  })

  function makeItem(rssFeedId: string) {
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Item ${random}`, link: `https://example.com/${random}` }
    return insertTestRssFeedItem({
      rssFeedId,
      urlId,
      guid: `authz-discoverability-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
  }

  describe('currentUserCanCreateStoryPost', () => {
    it('returns false for null user', () => {
      expect(currentUserCanCreateStoryPost(null)).toBe(false)
    })

    it('returns true for any non-null user', () => {
      expect(currentUserCanCreateStoryPost({ id: randomUUID() } as unknown as PrivateUser)).toBe(
        true,
      )
    })
  })

  describe('assertRssFeedItemIsDiscoverable', () => {
    it('resolves for items on a discoverable feed', async () => {
      const itemId = await makeItem(discoverableFeedId)
      await expect(assertRssFeedItemIsDiscoverable(itemId)).resolves.toBeUndefined()
    })

    it('throws 404 for unknown items', async () => {
      await expect(assertRssFeedItemIsDiscoverable(randomUUID())).rejects.toMatchObject({
        status: 404,
      })
    })

    it('throws 403 with FEED_NOT_DISCOVERABLE for items on a non-discoverable feed', async () => {
      const itemId = await makeItem(nonDiscoverableFeedId)
      await expect(assertRssFeedItemIsDiscoverable(itemId)).rejects.toMatchObject({
        status: 403,
        code: FEED_NOT_DISCOVERABLE,
      })
    })
  })

  describe('assertStoryIsDiscoverable', () => {
    it('resolves for stories whose source feed is discoverable', async () => {
      const story = await insertTestStory({ title: 'Discoverable Story' })
      const itemId = await makeItem(discoverableFeedId)
      await setTestItemStoryId(itemId, story.id)
      await expect(assertStoryIsDiscoverable(story.id)).resolves.toBeUndefined()
    })

    it('throws 404 for unknown stories', async () => {
      await expect(assertStoryIsDiscoverable(randomUUID())).rejects.toMatchObject({
        status: 404,
      })
    })

    it('throws 403 with FEED_NOT_DISCOVERABLE when the story has no items', async () => {
      const story = await insertTestStory({ title: 'Itemless Story' })
      await expect(assertStoryIsDiscoverable(story.id)).rejects.toMatchObject({
        status: 403,
        code: FEED_NOT_DISCOVERABLE,
      })
    })

    it('throws 403 with FEED_NOT_DISCOVERABLE when the source feed is not discoverable', async () => {
      const story = await insertTestStory({ title: 'Non-discoverable Story' })
      const itemId = await makeItem(nonDiscoverableFeedId)
      await setTestItemStoryId(itemId, story.id)
      await expect(assertStoryIsDiscoverable(story.id)).rejects.toMatchObject({
        status: 403,
        code: FEED_NOT_DISCOVERABLE,
      })
    })
  })

  it('routes mutable discoverability reads through the write pool', async () => {
    const itemId = await makeItem(discoverableFeedId)
    const itemRead = await observeTestPostgresQueryPools('/* getRssFeedItemById */', () =>
      assertRssFeedItemIsDiscoverable(itemId),
    )
    expect(itemRead.pools).toEqual(['write'])

    const story = await insertTestStory({ title: 'Primary-read Story' })
    await setTestItemStoryId(itemId, story.id)
    const storyRead = await observeTestPostgresQueryPools('/* assertStoryIsDiscoverable */', () =>
      assertStoryIsDiscoverable(story.id),
    )
    expect(storyRead.pools).toEqual(['write'])
  })
})
