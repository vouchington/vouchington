import type { Queue } from 'glide-mq'
import { createEmbeddingCreationWorker } from '../workers/bedrock-embeddings-batch/workers/bedrock-embeddings-batch-creation.mts'
import type { BatchCreationDependencies } from '../services/bedrock-embeddings-batch/utils.mts'
import { createBatch } from '../services/bedrock-embeddings-batch/orchestrator/create.mts'
import { minimumImageBatchSizeMB } from '../services/bedrock-embeddings/batch/input-size-limits.mts'

/** Controlled admission for empty routing only; submission remains the production function. */
const emptyEmbeddingCreationDependencies: BatchCreationDependencies = {
  getBatchCreationLimits: async () => ({
    allowed: true,
    maxRecords: 1,
    minRecords: 1,
    maxSizeMB: minimumImageBatchSizeMB(1),
  }),
  createBatch,
}

/** Fresh fixed cursor keeps real empty scans bounded to an already-finished window. */
export function createEmptyEmbeddingCursor() {
  return {
    sweepStartedAt: '2024-01-01T00:00:00.000Z',
    afterId: '00000000-0000-0000-0000-000000000000',
  }
}

export function createEmptyEmbeddingCreationWorker(queue: Queue) {
  return createEmbeddingCreationWorker(
    queue,
    { blockTimeout: 100, promotionInterval: 100 },
    emptyEmbeddingCreationDependencies,
  )
}
