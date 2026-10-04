import { describe, expect, it } from 'vitest'
import { MAX_EMBEDDING_TEXT_LENGTH } from '../config.mts'
import { createEmbeddingTextRecordLine, minimumTextBatchSizeMB } from './input-size-limits.mts'

describe('text batch capacity bound', () => {
  it('covers the actual worst escaped text, composite identifier, hash and newline', () => {
    const bytes =
      Buffer.byteLength(
        createEmbeddingTextRecordLine({
          entity_id: `${crypto.randomUUID()}-${-(2 ** 31)}`,
          content: '\u0000'.repeat(MAX_EMBEDDING_TEXT_LENGTH),
          content_sha256: Buffer.alloc(32),
        }),
      ) + 1
    expect(minimumTextBatchSizeMB(1) * 1024 * 1024).toBe(bytes)
    expect(minimumTextBatchSizeMB(3)).toBe(minimumTextBatchSizeMB(1) * 3)
  })
})
