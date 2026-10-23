import { describe, expect, it } from 'vitest'
import type { ExpiredMonthlyPartition } from '@vouchington/postgres/partitions'
import type { QueryExecutor } from '../types.mts'
import { beforeRetireMonthlyPartition } from './before-retire-monthly-partition.mts'
import { withTestScopedCrawlRetirementReference } from '@voucha/test-helpers'

function partition(table: string, partitionName: string): ExpiredMonthlyPartition {
  return { table, partitionName, year: 2019, month: 1, dropPriority: 0 }
}

function recordStatements(statements: string[]): QueryExecutor {
  return async input => {
    statements.push(typeof input === 'string' ? input : input.text)
    return { rows: [], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] }
  }
}

describe('beforeRetireMonthlyPartition', () => {
  it('clears an owned discovery FK on the existing crawl partition before retirement', async () => {
    const state = await withTestScopedCrawlRetirementReference(beforeRetireMonthlyPartition)
    expect(state).toEqual({
      discoveryRetained: true,
      pointerCleared: true,
      crawlRemovable: true,
    })
  })
  it('removes embedding batch entities before a crawl-chunk partition is retired', async () => {
    const statements: string[] = []
    await beforeRetireMonthlyPartition(
      recordStatements(statements),
      partition('crawl_chunks', 'crawl_chunks__p_2019_01'),
    )
    expect(statements.map(statement => statement.trim())).toEqual([
      `/* retireMonthlyPartition:deleteChunkBatchEntities */
      DELETE FROM bedrock_embedding_batch_entities AS entity
      USING crawl_chunks__p_2019_01 AS chunk
      WHERE entity.crawl_id = chunk.crawl_id AND entity.crawl_order_index = chunk.order_index`,
    ])
  })

  it('clears all crawl pointers and deletes retained chunks in order', async () => {
    const statements: string[] = []
    await beforeRetireMonthlyPartition(
      recordStatements(statements),
      partition('crawls', 'crawls__p_2019_01'),
    )
    const normalize = (statement: string) => statement.replaceAll(/\s+/gu, ' ').trim()
    expect(statements.slice(0, -1).map(normalize).toSorted()).toEqual(
      [
        '/* retireMonthlyPartition:clearBatchCrawls */ UPDATE bedrock_embedding_batches SET crawl_id = NULL WHERE crawl_id IN (SELECT id FROM crawls__p_2019_01)',
        '/* retireMonthlyPartition:clearReferralCrawls */ UPDATE user_referral_program_links SET last_crawl_id = NULL WHERE last_crawl_id IN (SELECT id FROM crawls__p_2019_01)',
        '/* retireMonthlyPartition:clearImportDiscoveryCrawls */ UPDATE user_rss_feed_import_row_discoveries SET crawl_id = NULL WHERE crawl_id IN (SELECT id FROM crawls__p_2019_01)',
      ].toSorted(),
    )
    expect(normalize(statements.at(-1)!)).toBe(
      '/* retireMonthlyPartition:deleteCrawlChunks */ DELETE FROM crawl_chunks WHERE crawl_id IN (SELECT id FROM crawls__p_2019_01)',
    )
  })

  it('leaves independent RSS partitions without app-specific crawl mutations', async () => {
    const statements: string[] = []
    await beforeRetireMonthlyPartition(
      recordStatements(statements),
      partition('rss_feed_crawls', 'rss_feed_crawls__p_2019_01'),
    )
    expect(statements).toEqual([])
  })

  it('rejects unsafe identifiers before issuing app-owned SQL', async () => {
    const statements: string[] = []
    const query = recordStatements(statements)
    await expect(
      beforeRetireMonthlyPartition(query, partition('crawls;SELECT 1', 'crawls__p_2019_01')),
    ).rejects.toThrow('Unsafe SQL identifier')
    await expect(
      beforeRetireMonthlyPartition(query, partition('crawls', 'crawls__p_2019_01;SELECT 1')),
    ).rejects.toThrow('Unsafe SQL identifier')
    expect(statements).toEqual([])
  })
})
