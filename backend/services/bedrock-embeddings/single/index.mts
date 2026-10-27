import { applySingleEmbedding, type SingleEmbeddingTarget } from './apply.mts'
import { createBedrockEmbedding } from './request.mts'
import { requireDenseEmbedding } from './require-dense-embedding.mts'
import { lookupExistingEmbedding } from '../lookup.mts'
import { insertCentralizedEmbeddingsBulk } from '../centralized-table.mts'
import { isEntityLockedForBatch } from '../batch/locks.mts'
import { sha256 } from '@modules/utils'
import { trackAIEmbeddingShortCircuit } from '@services/analytics'

type CreateEmbeddingJobData = SingleEmbeddingTarget & { content: string }

export const createSingleEmbedding = async (data: CreateEmbeddingJobData): Promise<void> => {
  const content_sha256 = sha256(data.content)

  if (await isEntityLockedForBatch(data.type, data.id)) {
    trackAIEmbeddingShortCircuit({ reason: 'batch_lock', entityType: data.type })
    return
  }

  const existingEmbedding = await lookupExistingEmbedding(content_sha256)

  if (existingEmbedding) {
    trackAIEmbeddingShortCircuit({ reason: 'centralized_cache', entityType: data.type })
    await applySingleEmbedding(data, content_sha256, existingEmbedding)
    return
  }

  const result = await createBedrockEmbedding(data.content, {
    entityType: data.type,
  })
  const embedding = requireDenseEmbedding(result.embedding)
  const input_token_count = result.tokens

  await insertCentralizedEmbeddingsBulk([{ content_sha256, embedding, input_token_count }])

  await applySingleEmbedding(data, content_sha256, { embedding, input_token_count })
}
