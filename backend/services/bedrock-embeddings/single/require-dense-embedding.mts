import { unrecoverable } from '@modules/queue-errors'
import { EMBEDDING_DIMENSION } from '../config.mts'

export function requireDenseEmbedding(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== EMBEDDING_DIMENSION ||
    value.some(element => typeof element !== 'number' || !Number.isFinite(element))
  ) {
    unrecoverable(new Error('Bedrock embedding is not a dense vector'))
  }
  return value as number[]
}
