import assert from 'node:assert/strict'
import { describe, it, vi } from 'vitest'
import { STAGING_RSS_FEEDS } from './config-driven/0080-00-01a-staging-rss-feeds.mts'
import {
  checkStagingRssBootstrap,
  type StagingBootstrapReader,
  type StagingFeedRow,
} from './check-staging-rss-bootstrap.mts'

const feeds = (): StagingFeedRow[] =>
  STAGING_RSS_FEEDS.map(feed => ({
    url: feed.url,
    slug: feed.slug,
    is_enabled: true,
    is_discoverable: true,
  })).toSorted((a, b) => a.url.localeCompare(b.url))

function returning(feedRows: StagingFeedRow[], publisherSlugs: string[]) {
  const readFeeds = vi
    .fn<StagingBootstrapReader['readFeeds']>()
    .mockResolvedValue({ rows: feedRows })
  const readPublisherSlugs = vi
    .fn<StagingBootstrapReader['readPublisherSlugs']>()
    .mockResolvedValue({ rows: publisherSlugs.map(slug => ({ slug })) })
  return { readFeeds, readPublisherSlugs }
}

describe('staging RSS fresh bootstrap check', () => {
  it('reads the configured feed URLs and Cloudflare topic through parameterized queries', async () => {
    const reader = returning(feeds(), ['blog'])
    await checkStagingRssBootstrap(reader)
    assert.equal(reader.readFeeds.mock.calls.length, 1)
    assert.equal(reader.readPublisherSlugs.mock.calls.length, 1)
    assert.deepEqual(reader.readFeeds.mock.calls[0]?.[1], [STAGING_RSS_FEEDS.map(feed => feed.url)])
    assert.deepEqual(reader.readPublisherSlugs.mock.calls[0]?.[1], [
      STAGING_RSS_FEEDS.find(feed => feed.hostname === 'blog.cloudflare.com')?.slug,
    ])
    assert.match(reader.readFeeds.mock.calls[0]?.[0] ?? '', /t\.deleted_at IS NULL/u)
    assert.match(reader.readPublisherSlugs.mock.calls[0]?.[0] ?? '', /source\.deleted_at IS NULL/u)
  })

  it('rejects a missing, disabled, non-discoverable, or wrongly related feed', async () => {
    const all = feeds()
    await assert.rejects(checkStagingRssBootstrap(returning(all.slice(1), ['blog'])))
    await assert.rejects(
      checkStagingRssBootstrap(
        returning(
          all.map(row =>
            row.url === STAGING_RSS_FEEDS[0]?.url ? { ...row, is_enabled: false } : row,
          ),
          ['blog'],
        ),
      ),
    )
    await assert.rejects(
      checkStagingRssBootstrap(
        returning(
          all.map(row =>
            row.url === STAGING_RSS_FEEDS[0]?.url ? { ...row, is_discoverable: false } : row,
          ),
          ['blog'],
        ),
      ),
    )
    await assert.rejects(checkStagingRssBootstrap(returning(all, [])))
    await assert.rejects(checkStagingRssBootstrap(returning(all, ['corporate-media'])))
  })
})
