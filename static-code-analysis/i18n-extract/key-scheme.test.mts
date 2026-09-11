import { describe, expect, it } from 'vitest'
import { computeKey, deriveNamespace, hash8, normalizeText, slugify } from './key-scheme.mts'

describe('normalizeText', () => {
  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeText('Hello   world')).toBe('Hello world')
  })

  it('collapses newlines and tabs from a multi-line JSX text node', () => {
    expect(normalizeText('  Hello\n\t  world  \n')).toBe('Hello world')
  })

  it('is idempotent', () => {
    const once = normalizeText('  a\n  b  ')
    expect(normalizeText(once)).toBe(once)
  })
})

describe('deriveNamespace', () => {
  it('camelCases a hyphenated file basename and single-word parent dir', () => {
    expect(deriveNamespace('web/components/comments/comment-tree.tsx')).toBe(
      'extracted.comments.commentTree',
    )
  })

  it('strips .ts/.tsx/.mts extensions equivalently', () => {
    expect(deriveNamespace('web/app/(my)/my/data/page.tsx')).toBe('extracted.data.page')
  })

  it('falls back to "dir"/"file" segments when a path segment has no letters/digits', () => {
    expect(deriveNamespace('web/---/___.tsx')).toBe('extracted.dir.file')
  })

  it('is a pure function of its input (same path, same namespace)', () => {
    const path = 'web/components/messages/recipient-picker.tsx'
    expect(deriveNamespace(path)).toBe(deriveNamespace(path))
  })
})

describe('slugify', () => {
  it('camelCases the first words of the normalized text', () => {
    expect(slugify('Hello world')).toBe('helloWorld')
  })

  it('caps the slug at the first 6 significant words', () => {
    expect(slugify('one two three four five six seven eight')).toBe('oneTwoThreeFourFiveSix')
  })

  it('falls back to "text" when the string has no letters/digits', () => {
    expect(slugify('!!!')).toBe('text')
  })
})

describe('hash8', () => {
  it('returns the first eight lowercase hex characters of the SHA-256 text digest', () => {
    expect(hash8('Hello world')).toBe('64ec88ca')
  })
})

describe('computeKey', () => {
  it('composes namespace, slug, and hash into the full dotted key', () => {
    const { fullKey, normalizedText } = computeKey(
      'web/components/comments/comment-tree.tsx',
      'Hello world',
    )
    expect(normalizedText).toBe('Hello world')
    expect(fullKey).toBe(`extracted.comments.commentTree.helloWorld_${hash8('Hello world')}`)
  })

  it('normalizes rawText before hashing, so incidental whitespace differences collide', () => {
    const a = computeKey('web/components/comments/comment-tree.tsx', 'Hello   world')
    const b = computeKey('web/components/comments/comment-tree.tsx', '  Hello\n  world  ')
    expect(a.fullKey).toBe(b.fullKey)
    expect(a.normalizedText).toBe(b.normalizedText)
  })

  it('is a pure function: same (filePath, rawText) always yields the same key, independent of call order', () => {
    const first = computeKey('web/components/messages/recipient-picker.tsx', 'Send message')
    // Interleave an unrelated computeKey call to prove there is no shared/mutated state.
    computeKey('web/app/(my)/my/data/page.tsx', 'Unrelated text')
    const second = computeKey('web/components/messages/recipient-picker.tsx', 'Send message')
    expect(first).toEqual(second)
  })

  it('produces different keys for different source text in the same file', () => {
    const a = computeKey('web/components/comments/comment-tree.tsx', 'Hello world')
    const b = computeKey('web/components/comments/comment-tree.tsx', 'Goodbye world')
    expect(a.fullKey).not.toBe(b.fullKey)
  })
})
