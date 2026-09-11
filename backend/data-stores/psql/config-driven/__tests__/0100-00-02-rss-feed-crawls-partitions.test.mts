import { describe, expect, it } from 'vitest'
import createRssFeedCrawlsPartitions from '../0100-00-02-rss-feed-crawls-partitions.mts'
import {
  MONTHLY_PARTITION_RETENTION_TABLES,
  RSS_PARTITION_TABLES,
} from '../utils/partition-config.mts'

describe('createRssFeedCrawlsPartitions', () => {
  it('creates monthly range partitions without a default child', () => {
    const sql = createRssFeedCrawlsPartitions()

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS rss_feed_crawls__p_')
    expect(sql).toContain('PARTITION OF rss_feed_crawls')
    expect(sql).toContain('FOR VALUES FROM')
    expect(sql).not.toContain('rss_feed_crawls__default')
    expect(sql).not.toContain('DROP TABLE')
    expect(sql).not.toContain('DETACH PARTITION')
  })
})

describe('RSS_PARTITION_TABLES retention', () => {
  it('registers rss_feed_crawls for 30-day monthly partition drop', () => {
    expect(RSS_PARTITION_TABLES).toEqual([
      { table: 'rss_feed_crawls', retentionDays: 30, futureMonths: 2 },
    ])
    expect(MONTHLY_PARTITION_RETENTION_TABLES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'rss_feed_crawls',
          retentionDays: 30,
          futureMonths: 2,
        }),
      ]),
    )
  })
})
