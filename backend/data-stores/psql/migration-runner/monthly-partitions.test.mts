import { describe, expect, it } from 'vitest'
import { retireMonthlyPartition } from '@vouchington/postgres/partitions'
import type { QueryExecutor } from '../types.mts'
import {
  createMonthlyPartitions,
  dropRssFeedCrawlsDefaultPartition,
} from './monthly-partitions.mts'
import { beforeRetireMonthlyPartition } from './before-retire-monthly-partition.mts'

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

    expect(statements.length).toBeGreaterThan(1)
    expect(statements[0]).toBe(
      '/* dropRssFeedCrawlsDefaultPartition */ DROP TABLE IF EXISTS rss_feed_crawls__default',
    )
    expect(statements[1]).toContain('CREATE')
  })
})

describe('retireMonthlyPartition', () => {
  it('clears referral-link crawl pointers before dropping an expired crawls partition', async () => {
    const statements: string[] = []

    await retireMonthlyPartition(
      recordStatements(statements),
      {
        table: 'crawls',
        partitionName: 'crawls__p_2019_01',
        dropPriority: 0,
        year: 2019,
        month: 1,
      },
      beforeRetireMonthlyPartition,
    )

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

describe('monthly partition retirement SQL', () => {
  it('deletes embedding batch entities before detaching and dropping chunks', async () => {
    const statements = await collectMonthlyRetirementStatements(
      'crawl_chunks',
      'crawl_chunks__p_2019_01',
    )
    expect(statements.map(statement => statement.trim())).toEqual([
      `/* retireMonthlyPartition:deleteChunkBatchEntities */
      DELETE FROM bedrock_embedding_batch_entities AS entity
      USING crawl_chunks__p_2019_01 AS chunk
      WHERE entity.crawl_id = chunk.crawl_id AND entity.crawl_order_index = chunk.order_index`,
      '/* retireMonthlyPartition:detach */ ALTER TABLE crawl_chunks DETACH PARTITION crawl_chunks__p_2019_01',
      '/* retireMonthlyPartition:drop */ DROP TABLE crawl_chunks__p_2019_01',
    ])
  })

  it('clears both crawl pointers and deletes chunks before detach and drop', async () => {
    const statements = await collectMonthlyRetirementStatements('crawls', 'crawls__p_2019_01')
    expect(statements.map(statement => statement.trim())).toEqual([
      `/* retireMonthlyPartition:clearBatchCrawls */
      UPDATE bedrock_embedding_batches SET crawl_id = NULL
      WHERE crawl_id IN (SELECT id FROM crawls__p_2019_01)`,
      `/* retireMonthlyPartition:clearReferralCrawls */
      UPDATE user_referral_program_links SET last_crawl_id = NULL
      WHERE last_crawl_id IN (SELECT id FROM crawls__p_2019_01)`,
      `/* retireMonthlyPartition:deleteCrawlChunks */
      DELETE FROM crawl_chunks WHERE crawl_id IN (SELECT id FROM crawls__p_2019_01)`,
      '/* retireMonthlyPartition:detach */ ALTER TABLE crawls DETACH PARTITION crawls__p_2019_01',
      '/* retireMonthlyPartition:drop */ DROP TABLE crawls__p_2019_01',
    ])
  })

  it('detaches and drops an independent RSS partition without crawl mutations', async () => {
    expect(
      await collectMonthlyRetirementStatements('rss_feed_crawls', 'rss_feed_crawls__p_2019_01'),
    ).toEqual([
      '/* retireMonthlyPartition:detach */ ALTER TABLE rss_feed_crawls DETACH PARTITION rss_feed_crawls__p_2019_01',
      '/* retireMonthlyPartition:drop */ DROP TABLE rss_feed_crawls__p_2019_01',
    ])
  })

  it('rejects unsafe identifiers before returning retirement SQL', async () => {
    await expect(
      collectMonthlyRetirementStatements('crawls;SELECT 1', 'crawls__p_2019_01'),
    ).rejects.toThrow('Unsafe SQL identifier')
    await expect(
      collectMonthlyRetirementStatements('crawls', 'crawls__p_2019_01;SELECT 1'),
    ).rejects.toThrow('Unsafe SQL identifier')
  })
})

async function collectMonthlyRetirementStatements(table: string, partitionName: string) {
  const statements: string[] = []
  await retireMonthlyPartition(
    recordStatements(statements),
    {
      table,
      partitionName,
      year: 2019,
      month: 1,
      dropPriority: 0,
    },
    beforeRetireMonthlyPartition,
  )
  return statements
}
