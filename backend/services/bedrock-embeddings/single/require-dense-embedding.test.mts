import { UnrecoverableError } from '@vouchington/queue-errors'
import { describe, expect, it } from 'vitest'
import { EMBEDDING_DIMENSION } from '../config.mts'
import { requireDenseEmbedding } from './require-dense-embedding.mts'

describe('requireDenseEmbedding', () => {
  it('accepts a finite dense vector', () => {
    const embedding = new Array(EMBEDDING_DIMENSION).fill(0.1)
    expect(requireDenseEmbedding(embedding)).toBe(embedding)
  })

  it('rejects a non-array', () => {
    expect(() => requireDenseEmbedding({ float32: [0.1] })).toThrow(UnrecoverableError)
  })
})
