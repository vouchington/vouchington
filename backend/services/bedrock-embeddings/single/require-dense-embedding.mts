import { unrecoverable } from '@vouchington/queue-errors'
import {
  InvalidEmbeddingError,
  requireDenseEmbedding as requireDense,
} from '@vouchington/utils/bedrock-embeddings'
import { EMBEDDING_DIMENSION } from '../config.mts'

export function requireDenseEmbedding(value: unknown): number[] {
  try {
    return requireDense(value, EMBEDDING_DIMENSION)
  } catch (err) {
    if (err instanceof InvalidEmbeddingError) unrecoverable(err)
    throw err
  }
}
