import { randomUUID } from 'node:crypto'
import {
  addDummyEmbeddingToRssFeedItem,
  addRssFeedItemSource,
  insertTestRssFeedDirect,
  makeNearbyEmbedding,
  makeRandomEmbedding,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { insertRssFeedStateChanges } from '../rss-feeds/state-changes.mts'
import { searchRssFeedItemsBySemantic } from './search-semantic.mts'
import { upsertRssFeedItems } from './upsert.mts'

describe('semantic RSS feed scope', () => {
  it('requires an eligible supplied feed and returns a shared item only once', async () => {
    const [visible, alsoVisible, hidden, disabled, outside] = await Promise.all(
      Array.from({ length: 5 }, () => insertTestRssFeedDirect({})),
    )
    const embedding = makeRandomEmbedding()
    const nonce = randomUUID()
    const [shared, hiddenItem, disabledItem] = await Promise.all(
      [visible, hidden, disabled].map(async feed => {
        const [item] = await upsertRssFeedItems(feed.id, [
          {
            link: `https://example.com/semantic-scope-${nonce}-${feed.id}`,
            guid: `semantic-scope-${nonce}-${feed.id}`,
            title: `Semantic feed scope ${feed.id}`,
          },
        ])
        await addDummyEmbeddingToRssFeedItem(item.id, { embedding: makeNearbyEmbedding(embedding) })
        return item.id
      }),
    )
    await Promise.all([
      addRssFeedItemSource(alsoVisible.id, shared),
      addRssFeedItemSource(outside.id, hiddenItem),
      addRssFeedItemSource(outside.id, disabledItem),
      insertRssFeedStateChanges(hidden.id, [{ kind: 'discoverability', is_enabled: false }], null),
      insertRssFeedStateChanges(disabled.id, [{ kind: 'enablement', is_enabled: false }], null),
    ])

    const search = (feedIds: string[]) =>
      searchRssFeedItemsBySemantic({
        semantic_search_query: 'feed scope',
        rss_feed_ids: feedIds,
        limit: 10,
        dependencies: { getCachedSearchEmbedding: async () => embedding },
      })

    const outsidePage = await search([outside.id])
    expect(outsidePage.results.map(item => item.id).toSorted()).toEqual(
      [hiddenItem, disabledItem].toSorted(),
    )
    const [hiddenPage, disabledPage] = await Promise.all([
      search([hidden.id]),
      search([disabled.id]),
    ])
    expect(hiddenPage.results).toEqual([])
    expect(disabledPage.results).toEqual([])
    const scopedPage = await search([visible.id, alsoVisible.id, hidden.id, disabled.id])
    expect(scopedPage.results.map(item => item.id)).toEqual([shared])
  })
})
