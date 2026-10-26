import { unrecoverable } from '@vouchington/queue-errors'
import { requireDenseEmbedding as requireDense } from '@vouchington/utils/bedrock-embeddings'
import { EMBEDDING_DIMENSION } from '../config.mts'

export function requireDenseEmbedding(value: unknown): number[] {
  try {
    return requireDense(value, EMBEDDING_DIMENSION)
  } catch (err) {
    // The package throws only InvalidEmbeddingError, an Error subclass.
    return unrecoverable(err as Error)
  }
}
