import { describe, expect, it } from 'vitest'
import { MAX_EMBEDDING_TEXT_LENGTH, truncateEmbeddingText } from './config.mts'

describe('truncateEmbeddingText', () => {
  it('returns the text unchanged when it is at the limit', () => {
    const text = 'a'.repeat(MAX_EMBEDDING_TEXT_LENGTH)
    expect(truncateEmbeddingText(text)).toBe(text)
  })

  it('returns the text unchanged when it is under the limit', () => {
    const text = 'hello world'
    expect(truncateEmbeddingText(text)).toBe(text)
  })

  it('truncates to the last whitespace boundary when over the limit', () => {
    // Build a string just over the limit with a word boundary inside it
    const prefix = 'word '.repeat(Math.floor(MAX_EMBEDDING_TEXT_LENGTH / 5) + 1)
    expect(prefix.length).toBeGreaterThan(MAX_EMBEDDING_TEXT_LENGTH)

    const result = truncateEmbeddingText(prefix)
    expect(result.length).toBeLessThanOrEqual(MAX_EMBEDDING_TEXT_LENGTH)
    // Must be a prefix of the original
    expect(prefix.startsWith(result)).toBe(true)
    // The character immediately after the cut point must be whitespace — we did not split mid-word
    expect(prefix[result.length]).toMatch(/\s/)
  })

  it('falls back to a hard slice when there is no whitespace in the head', () => {
    const text = 'x'.repeat(MAX_EMBEDDING_TEXT_LENGTH + 100)
    const result = truncateEmbeddingText(text)
    expect(result.length).toBe(MAX_EMBEDDING_TEXT_LENGTH)
    expect(text.startsWith(result)).toBe(true)
  })

  it('does not cut surrogate pairs at the boundary', () => {
    // '𠮷' is U+20BB7, encoded as a surrogate pair (2 UTF-16 code units).
    // Place it so the high surrogate lands exactly at MAX_EMBEDDING_TEXT_LENGTH - 1.
    const emoji = '\u{20BB7}' // '𠮷', length === 2
    const text = `${'a'.repeat(MAX_EMBEDDING_TEXT_LENGTH - 1) + emoji}extra`
    const result = truncateEmbeddingText(text)
    // The high surrogate at position MAX-1 must not be returned unpaired.
    expect(result.length).toBeLessThan(MAX_EMBEDDING_TEXT_LENGTH)
    // Result should be fully valid (no unpaired surrogates).
    expect(() => encodeURIComponent(result)).not.toThrow()
  })
})
