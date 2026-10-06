import { describe, expect, it } from 'vitest'
import { ALL_MONTHLY_PARTITION_TABLES } from '../config-driven/utils/partition-config.mts'
import { generateMonthlyPartitions } from '../config-driven/utils/partition-utils.mts'
import type { QueryExecutor } from '../types.mts'
import {
  createMonthlyPartitions,
  dropRssFeedCrawlsDefaultPartition,
  selectExpiredMonthlyPartitions,
} from './monthly-partitions.mts'
import { retireMonthlyPartition } from './retire-monthly-partitions.mts'

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
    const statements: string[] = []
    const writer = recordStatements(statements)

    await createMonthlyPartitions(writer)

    expect(statements).toHaveLength(2)
    expect(statements[0]).toBe(
      '/* dropRssFeedCrawlsDefaultPartition */ DROP TABLE IF EXISTS rss_feed_crawls__default',
    )
    expect(statements[1]).toBe(generateMonthlyPartitions({ tables: ALL_MONTHLY_PARTITION_TABLES }))
    expect(statements[1]).toContain('CREATE')
  })
})

describe('retireMonthlyPartition', () => {
  it('clears referral-link crawl pointers before dropping an expired crawls partition', async () => {
    const statements: string[] = []

    await retireMonthlyPartition(recordStatements(statements), {
      table: 'crawls',
      partitionName: 'crawls__p_2019_01',
      dropPriority: 0,
      year: 2019,
      month: 1,
    })

    const clearIndex = statements.findIndex(statement =>
      statement.includes('retireMonthlyPartition:clearReferralCrawls'),
    )
    const dropIndex = statements.findIndex(statement =>
      statement.includes('retireMonthlyPartition:drop'),
    )
    expect(statements[clearIndex]).toContain('user_referral_program_links')
    expect(statements[clearIndex]).toContain('crawls__p_2019_01')
    expect(dropIndex).toBeGreaterThan(clearIndex)
  })
})

function recordStatements(statements: string[]): QueryExecutor {
  return async input => {
    statements.push(typeof input === 'string' ? input : input.text)
    return { rows: [], rowCount: 0, command: 'DROP', oid: 0, fields: [] }
  }
}
