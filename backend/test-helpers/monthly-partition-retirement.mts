import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '../data-stores/psql/setup.mts'
import {
  retireExpiredMonthlyPartitions,
  type ExpiredMonthlyPartition,
} from '../data-stores/psql/migration-runner/retire-monthly-partitions.mts'
import { MONTHLY_RETIREMENT_SCHEMA } from './monthly-partition-retirement-schema.mts'

export async function createMonthlyPartitionRetirementFixture() {
  const schema = `retirement_${randomUUID().replaceAll('-', '')}`
  await using setup = await beginTransaction()
  await setup(`/* createMonthlyPartitionRetirementFixture */ CREATE SCHEMA ${schema}`)
  await setup(`/* createMonthlyPartitionRetirementFixture */ SET LOCAL search_path TO ${schema}`)
  await setup(MONTHLY_RETIREMENT_SCHEMA)
  await setup.commit()

  async function startTransaction() {
    const transaction = await beginTransaction()
    try {
      await transaction(
        `/* monthlyPartitionRetirementFixture */ SET LOCAL search_path TO ${schema}`,
      )
      return transaction
    } catch (err) {
      await transaction[Symbol.asyncDispose]()
      throw err
    }
  }

  return {
    async retire(tables: string[]) {
      const errors: Error[] = []
      const partitions: ExpiredMonthlyPartition[] = tables.map(table => ({
        table,
        partitionName: `${table}__p_2019_01`,
        year: 2019,
        month: 1,
        dropPriority: 0,
      }))
      await retireExpiredMonthlyPartitions(partitions, startTransaction, error =>
        errors.push(error),
      )
      return errors
    },
    async addUnexpectedCrawlReference() {
      await using query = await startTransaction()
      await query(`/* addUnexpectedCrawlReference:create */
        CREATE TABLE unexpected_reference (crawl_id uuid REFERENCES crawls ON DELETE RESTRICT)`)
      await query(`/* addUnexpectedCrawlReference:insert */
        INSERT INTO unexpected_reference VALUES ('00000000-0000-7000-8000-000000000001')`)
      await query.commit()
    },
    async state() {
      await using query = await startTransaction()
      const { rows } = await query<{
        crawl_partition: boolean
        chunk_partition: boolean
        rss_partition: boolean
        chunk_exists: boolean
        entity_exists: boolean
        batch_crawl_id: string | null
        referral_crawl_id: string | null
      }>(`/* readMonthlyPartitionRetirementState */ SELECT
        to_regclass('crawls__p_2019_01') IS NOT NULL AS crawl_partition,
        to_regclass('crawl_chunks__p_2019_01') IS NOT NULL AS chunk_partition,
        to_regclass('rss_feed_crawls__p_2019_01') IS NOT NULL AS rss_partition,
        EXISTS (SELECT 1 FROM crawl_chunks) AS chunk_exists,
        EXISTS (SELECT 1 FROM bedrock_embedding_batch_entities) AS entity_exists,
        (SELECT crawl_id FROM bedrock_embedding_batches WHERE id = 'owned-batch') AS batch_crawl_id,
        (SELECT last_crawl_id FROM user_referral_program_links LIMIT 1) AS referral_crawl_id`)
      return rows[0]!
    },
    async [Symbol.asyncDispose]() {
      await write(`/* disposeMonthlyPartitionRetirementFixture */ DROP SCHEMA ${schema} CASCADE`)
    },
  }
}
