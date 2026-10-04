import { createPendingScan, type PendingScanOptions } from './scan-options.mts'
import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import { createTopicEmbeddingContent } from '@services/topics/content'
import type { BatchUpdateItem } from '@services/bedrock-embeddings/batch/types'
import { applyBatchUpdates } from '../orchestrator/save.mts'
import {
  copyExistingEmbeddings,
  type EmbeddingReconciliationOptions,
  type EmbeddingReconciliationPage,
} from '../orchestrator/reconcile-existing.mts'
import { lockExistsClause } from '@services/bedrock-embeddings/batch/lock-targets'
import {
  reusableEmbeddingMissingClause,
  streamPendingEntities,
  type PendingEntity,
} from './shared.mts'

type PendingTopic = PendingEntity

export async function copyExistingTopicEmbeddings(
  options: EmbeddingReconciliationOptions = {},
): Promise<EmbeddingReconciliationPage> {
  return copyExistingEmbeddings('topics', options)
}

export async function* streamPendingTopics(
  options: PendingScanOptions = {},
): AsyncGenerator<PendingTopic, void, unknown> {
  const scan = createPendingScan(options)
  const query = `/* streamPendingTopics */
    SELECT t.id, t.name, t.aliases, t.markdown
    FROM topics t
    WHERE t.id < $1::uuid AND ($2::uuid IS NULL OR t.id < $2::uuid)
      AND t.deleted_at IS NULL
      AND (
        t.bedrock_nova_multimodal_v1_input_sha256 IS NULL
        OR t.bedrock_nova_multimodal_v1_input_sha256 != t.bedrock_nova_multimodal_v1_content_sha256
      )
      AND ${reusableEmbeddingMissingClause('t')}
      AND NOT ${lockExistsClause('topics', 't.id')}
    ORDER BY t.id DESC
  `

  yield* streamPendingEntities<{ id: string; name: string; aliases: string[]; markdown: string }>(
    createAsyncGeneratorFromCursor<{
      id: string
      name: string
      aliases: string[]
      markdown: string
    }>(query, [scan.upperId, scan.afterId], {
      batchSize: scan.limits.batchSize,
      maxRows: scan.limits.maxRows,
      onComplete: scan.complete,
    }),
    row =>
      createTopicEmbeddingContent({
        name: row.name,
        aliases: row.aliases,
        markdown: row.markdown,
      }),
  )
}

export async function applyTopicBatchUpdates(items: BatchUpdateItem[]): Promise<void> {
  await applyBatchUpdates('topics', items)
}
