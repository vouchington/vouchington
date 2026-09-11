import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import { createTopicEmbeddingContent } from '@services/topics/content'
import type { BatchUpdateItem } from '@services/bedrock-embeddings/batch/types'
import { copyExistingEmbeddings, applyBatchUpdates } from '../orchestrator/save.mts'
import { lockExistsClause } from '@services/bedrock-embeddings/batch/lock-targets'
import {
  reusableEmbeddingMissingClause,
  streamPendingEntities,
  type PendingEntity,
} from './shared.mts'

type PendingTopic = PendingEntity

export async function copyExistingTopicEmbeddings(): Promise<void> {
  await copyExistingEmbeddings('topics', { excludeDeleted: true })
}

export async function* streamPendingTopics(): AsyncGenerator<PendingTopic, void, unknown> {
  const query = `/* streamPendingTopics */
    SELECT t.id, t.name, t.aliases, t.markdown
    FROM topics t
    WHERE t.deleted_at IS NULL
      AND (
        t.bedrock_nova_multimodal_v1_input_sha256 IS NULL
        OR t.bedrock_nova_multimodal_v1_input_sha256 != t.bedrock_nova_multimodal_v1_content_sha256
      )
      AND ${reusableEmbeddingMissingClause('t')}
      AND NOT ${lockExistsClause('topics', 't.id')}
    ORDER BY t.id DESC
  `

  yield* streamPendingEntities<{ id: string; name: string; aliases: string[]; markdown: string }>(
    createAsyncGeneratorFromCursor(query, [], { batchSize: 1000 }),
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
