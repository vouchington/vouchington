import { copyExistingEmbeddings } from '@services/bedrock-embeddings-batch/orchestrator/reconcile-existing'
import { getStaleBatches } from '@services/bedrock-embeddings-batch/orchestrator/find-stale'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runBedrockSelection3511Scenarios(): Promise<void> {
  registerScenarioContract('bedrock-embedding-mismatch-page', {
    seededRows: { posts: 110000 },
    expectations: [
      { kind: 'usesIndexes', indexes: ['posts__default_id_idx1'] },
      { kind: 'maxProcessedRows', relation: 'posts', max: 20 },
    ],
  })
  await runAndCapture(
    'bedrock-embedding-mismatch-page',
    async () => {
      const page = await copyExistingEmbeddings('posts', {
        after: encodeScopedUuidCursor(
          '01b00000-9fff-7000-8000-000000000000',
          'embedding-reconciliation:posts:id-asc',
        ),
        limit: 10,
      })
      if (page.scannedCount !== 10) throw new Error('Expected a full embedding mismatch page')
    },
    undefined,
    'copyExistingEmbeddings candidates',
  )

  registerScenarioContract('bedrock-stale-batches-page', {
    seededRows: { bedrock_embedding_batches: 10000 },
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_bedrock_embedding_batches__stale_due'] },
      { kind: 'maxProcessedRows', relation: 'bedrock_embedding_batches', max: 120 },
    ],
  })
  await runAndCapture(
    'bedrock-stale-batches-page',
    async () => {
      const page = await getStaleBatches(24)
      if (page.batches.length !== 100) throw new Error('Expected 100 stale Bedrock batches')
    },
    undefined,
    'getStaleBatches',
  )
}
