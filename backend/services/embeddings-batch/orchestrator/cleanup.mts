import { write } from '@data-stores/psql'

export const cleanupBatchMembership = async (batchId: string): Promise<void> => {
  await write(
    `/* cleanupBatchMembership */
    DELETE FROM gemini_embedding_batch_entities
    WHERE batch_id = $1
  `,
    [batchId],
  )
}

export { stopVertexBatch } from '../provider.mts'
