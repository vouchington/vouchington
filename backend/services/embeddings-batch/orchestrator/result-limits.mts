import { MAX_BATCH_RECORDS } from '@services/embeddings/batch/input-size-limits'

// Full bounded request echo, one 1536-value vector and provider metadata fit in this bound.
export const MAX_RESULT_LINE_BYTES = 256 * 1024
export function resultByteLimit(records: number): number {
  if (!Number.isSafeInteger(records) || records < 1 || records > MAX_BATCH_RECORDS)
    throw new Error('Vertex batch has no valid admitted record count')
  return records * (MAX_RESULT_LINE_BYTES + 1) + 16 * 1024
}
