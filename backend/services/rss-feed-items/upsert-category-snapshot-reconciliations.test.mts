import { describe, expect, it } from 'vitest'
import { snapshotsForRssFeedItemRows } from './upsert-category-snapshot-reconciliations.mts'
import type { RssFeedItemWithHash } from './upsert-prepare.mts'

function item(guid: string, categories?: string[]): RssFeedItemWithHash {
  return {
    content_sha256: Buffer.alloc(0),
    url_id: 'url-id',
    feedItem: {
      guid,
      link: `https://example.com/${guid}`,
      ...(categories === undefined ? {} : { categories }),
    },
  }
}

describe('snapshotsForRssFeedItemRows', () => {
  it('omits rows whose partial metadata update did not include categories', () => {
    expect(
      snapshotsForRssFeedItemRows([item('partial')], [{ id: 'item-id', guid: 'partial' }]),
    ).toEqual([])
  })

  it('preserves explicit empty categories from complete crawler input', () => {
    expect(
      snapshotsForRssFeedItemRows([item('complete', [])], [{ id: 'item-id', guid: 'complete' }]),
    ).toEqual([{ rss_feed_item_id: 'item-id', categories: [] }])
  })
})
