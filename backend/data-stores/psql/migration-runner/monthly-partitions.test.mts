import { runIsolatedDatabaseCase } from '../../../../test-helpers/vitest-isolated-database-case.mts'
import { getIsolatedDatabaseCaseMode } from '../../../../test-helpers/vitest-isolated-database-cases.mts'
import { describe, expect, it } from 'vitest'
import {
  createTestReferralLinkWithLastCrawl,
  readTestReferralLinkLastCrawl,
} from '../../../test-helpers/entities/referral-link-crawl-pointers.mts'
import { generateMonthlyPartitions } from '../config-driven/utils/partition-utils.mts'
import { read, write } from '../index.mts'
import type { QueryExecutor } from '../types.mts'
import {
  cleanupPartitions,
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
    if (getIsolatedDatabaseCaseMode('partition-bootstrap-ddl') === 'parent') {
      await runIsolatedDatabaseCase('partition-bootstrap-ddl')
      return
    }
    await createMonthlyPartitions()

    const { rows } = await read<{ default_exists: boolean }>(
      `/* verifyRssFeedCrawlsDefaultDropped */
        SELECT to_regclass('rss_feed_crawls__default') IS NOT NULL AS default_exists`,
    )
    expect(rows).toEqual([{ default_exists: false }])
  }, 240_000)
})

describe('cleanupPartitions', () => {
  it('clears referral-link crawl pointers before dropping an expired crawls partition', async () => {
    if (getIsolatedDatabaseCaseMode('expired-crawl-partition-ddl') === 'parent') {
      await runIsolatedDatabaseCase('expired-crawl-partition-ddl')
      return
    }
    // A 2019 month keeps this test clear of the current partitions: a partition drop fires no
    // ON DELETE action, so the pointer must be cleared explicitly to avoid a dangling id.
    await write(
      generateMonthlyPartitions({
        tables: [{ table: 'crawls', pastMonths: 0, futureMonths: 0 }],
        baseDate: new Date('2019-01-15T00:00:00.000Z'),
      }),
    )
    const { linkId, crawlId } = await createTestReferralLinkWithLastCrawl(
      new Date('2019-01-15T00:00:00.000Z'),
    )
    expect(await readTestReferralLinkLastCrawl(linkId)).toEqual({
      exists: true,
      lastCrawlId: crawlId,
    })

    await cleanupPartitions(new Date('2019-03-15T00:00:00.000Z'))

    expect(await readTestReferralLinkLastCrawl(linkId)).toEqual({ exists: true, lastCrawlId: null })
    const { rows } = await read<{ partition_exists: boolean }>(
      `/* verifyExpiredCrawlsPartitionDropped */
        SELECT to_regclass('crawls__p_2019_01') IS NOT NULL AS partition_exists`,
    )
    expect(rows).toEqual([{ partition_exists: false }])
  }, 240_000)
})
