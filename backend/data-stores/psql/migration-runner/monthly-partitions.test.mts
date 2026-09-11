import { describe, expect, it } from 'vitest'
import { read } from '../index.mts'
import type { QueryExecutor } from '../types.mts'
import {
  createMonthlyPartitions,
  dropRssFeedCrawlsDefaultPartition,
  selectExpiredMonthlyPartitions,
} from './monthly-partitions.mts'

describe('selectExpiredMonthlyPartitions', () => {
  it('selects an RSS month once its upper bound is older than the 30-day cutoff', () => {
    const expired = selectExpiredMonthlyPartitions(
      [
        { parent_table: 'rss_feed_crawls', partition_table: 'rss_feed_crawls__p_2026_01' },
        { parent_table: 'rss_feed_crawls', partition_table: 'rss_feed_crawls__p_2026_03' },
      ],
      [{ table: 'rss_feed_crawls', retentionDays: 30 }],
      new Date('2026-03-04T00:00:00.000Z'),
    )

    expect(expired.map(partition => partition.partitionName)).toEqual([
      'rss_feed_crawls__p_2026_01',
    ])
  })
})

describe('dropRssFeedCrawlsDefaultPartition', () => {
  it('drops the leftover default child with an idempotent statement', async () => {
    const statements: string[] = []
    const writer: QueryExecutor = async input => {
      statements.push(typeof input === 'string' ? input : input.text)
      return {
        rows: [],
        rowCount: 0,
        command: 'DROP',
        oid: 0,
        fields: [],
      }
    }

    await dropRssFeedCrawlsDefaultPartition(writer)
    await dropRssFeedCrawlsDefaultPartition(writer)

    expect(statements).toEqual([
      '/* dropRssFeedCrawlsDefaultPartition */ DROP TABLE IF EXISTS rss_feed_crawls__default',
      '/* dropRssFeedCrawlsDefaultPartition */ DROP TABLE IF EXISTS rss_feed_crawls__default',
    ])
  })

  it('drops the leftover default child before creating monthly partitions', async () => {
    await createMonthlyPartitions()

    const { rows } = await read<{ default_exists: boolean }>(
      `/* verifyRssFeedCrawlsDefaultDropped */
        SELECT to_regclass('rss_feed_crawls__default') IS NOT NULL AS default_exists`,
    )
    expect(rows).toEqual([{ default_exists: false }])
  })
})
