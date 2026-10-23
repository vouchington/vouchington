import { requireDenseEmbedding as validateEmbedding } from '@vouchington/utils/bedrock-embeddings'
import { unrecoverable } from '@vouchington/queue-errors'
import { EMBEDDING_DIMENSION } from '../config.mts'

export function requireDenseEmbedding(value: unknown): number[] {
  try {
    return validateEmbedding(value, EMBEDDING_DIMENSION)
  } catch (err) {
    return unrecoverable(err)
  }
}
