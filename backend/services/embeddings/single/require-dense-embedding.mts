import { unrecoverable } from '@vouchington/queue-errors'
import { EMBEDDING_DIMENSION } from '../config.mts'

export function requireDenseEmbedding(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== EMBEDDING_DIMENSION ||
    !value.every((entry: unknown) => typeof entry === 'number' && Number.isFinite(entry))
  ) {
    return unrecoverable(new Error(`Expected ${EMBEDDING_DIMENSION} finite embedding values`))
  }
  return value as number[]
}
