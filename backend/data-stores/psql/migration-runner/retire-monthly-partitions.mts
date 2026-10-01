import onError from '@modules/on-error'
import { beginTransaction } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'

export type ExpiredMonthlyPartition = {
  table: string
  partitionName: string
  dropPriority: number
  year: number
  month: number
}

export function assertSafeSqlIdentifier(identifier: string): string {
  if (!/^[a-z0-9_]+$/u.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`)
  }
  return identifier
}

/** Partition retirement must perform referential actions explicitly: DROP does not fire them. */
export async function retireMonthlyPartition(
  query: QueryExecutor,
  partition: ExpiredMonthlyPartition,
): Promise<void> {
  const table = assertSafeSqlIdentifier(partition.table)
  const partitionName = assertSafeSqlIdentifier(partition.partitionName)
  if (table === 'crawl_chunks') {
    await query(`/* retireMonthlyPartition:deleteChunkBatchEntities */
      DELETE FROM bedrock_embeddings_batch_entities AS entity
      USING ${partitionName} AS chunk
      WHERE entity.crawl_id = chunk.crawl_id AND entity.crawl_order_index = chunk.order_index`)
  } else if (table === 'crawls') {
    await query(`/* retireMonthlyPartition:clearBatchCrawls */
      UPDATE bedrock_embeddings_batches SET crawl_id = NULL
      WHERE crawl_id IN (SELECT id FROM ${partitionName})`)
    await query(`/* retireMonthlyPartition:clearReferralCrawls */
      UPDATE user_referral_program_links SET last_crawl_id = NULL
      WHERE last_crawl_id IN (SELECT id FROM ${partitionName})`)
    // Also handles chunks whose partition was retained after an earlier retirement failure.
    // Row deletion cascades to embedding batch entities before the crawls parent is detached.
    await query(`/* retireMonthlyPartition:deleteCrawlChunks */
      DELETE FROM crawl_chunks WHERE crawl_id IN (SELECT id FROM ${partitionName})`)
  }
  await query(
    `/* retireMonthlyPartition:detach */ ALTER TABLE ${table} DETACH PARTITION ${partitionName}`,
  )
  await query(`/* retireMonthlyPartition:drop */ DROP TABLE ${partitionName}`)
}

export async function retireExpiredMonthlyPartitions(
  partitions: ExpiredMonthlyPartition[],
  startTransaction: typeof beginTransaction = beginTransaction,
  reportError: (error: Error) => void = onError,
): Promise<void> {
  async function retireAt(index: number): Promise<void> {
    const partition = partitions[index]
    if (!partition) return
    try {
      await using transaction = await startTransaction()
      await retireMonthlyPartition(transaction, partition)
      await transaction.commit()
    } catch (cause) {
      // Disposal has rolled back this partition's referential actions before the next starts.
      reportError(
        new Error(`Failed to retire monthly partition ${partition.partitionName}`, { cause }),
      )
    }
    await retireAt(index + 1)
  }
  await retireAt(0)
}
