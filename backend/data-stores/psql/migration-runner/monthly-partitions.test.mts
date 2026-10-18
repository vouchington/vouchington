import { describe, expect, it } from 'vitest'
import type { QueryExecutor } from '../types.mts'
import {
  createMonthlyPartitions,
  dropRssFeedCrawlsDefaultPartition,
} from './monthly-partitions.mts'

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

function recordStatements(statements: string[]): QueryExecutor {
  return async input => {
    statements.push(typeof input === 'string' ? input : input.text)
    return { rows: [], rowCount: 0, command: 'DROP', oid: 0, fields: [] }
  }
}
