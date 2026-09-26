import { describe, expect, it } from 'vitest'
import {
  STORY_CLUSTER_REASON,
  deriveNewStoryMetadata,
  normalizeStoryTitle,
} from './story-metadata.mts'

describe('normalizeStoryTitle', () => {
  it('decodes entities, strips markup, and collapses whitespace', () => {
    expect(normalizeStoryTitle('A &amp; B  <b>bold</b>\n\ttitle')).toBe('A & B bold title')
  })

  it('returns undefined for an undefined title', () => {
    expect(normalizeStoryTitle(undefined)).toBeUndefined()
  })

  it('returns undefined for a title that is empty after cleaning', () => {
    expect(normalizeStoryTitle('   <br/>   ')).toBeUndefined()
  })

  it('truncates to 500 code points without splitting a surrogate pair', () => {
    // U+1F600 (grinning face) is a surrogate pair in UTF-16 -- placed exactly at the boundary.
    const surrogatePairChar = '\u{1F600}'
    const raw = 'a'.repeat(499) + surrogatePairChar + 'b'.repeat(10)
    const normalized = normalizeStoryTitle(raw)
    expect(normalized).toBeDefined()
    expect(Array.from(normalized!)).toHaveLength(500)
    expect(normalized).toBe('a'.repeat(499) + surrogatePairChar)
    // No unpaired low/high surrogate at the cut point.
    expect(normalized).not.toMatch(/[\uD800-\uDBFF]$/)
  })
})

describe('deriveNewStoryMetadata', () => {
  it('takes the title from the selected member only, never the incoming item', () => {
    const metadata = deriveNewStoryMetadata({
      incomingPublishedAt: new Date('2026-01-01T00:00:00.000Z'),
      selectedItem: { title: 'Selected title', published_at: new Date('2026-01-02T00:00:00.000Z') },
    })
    expect(metadata.title).toBe('Selected title')
  })

  it('takes published_at as the earlier of the two members, independent of the title source', () => {
    const incomingEarlier = deriveNewStoryMetadata({
      incomingPublishedAt: new Date('2026-01-01T00:00:00.000Z'),
      selectedItem: { title: 'x', published_at: new Date('2026-01-05T00:00:00.000Z') },
    })
    expect(incomingEarlier.published_at).toEqual(new Date('2026-01-01T00:00:00.000Z'))

    const selectedEarlier = deriveNewStoryMetadata({
      incomingPublishedAt: new Date('2026-01-05T00:00:00.000Z'),
      selectedItem: { title: 'x', published_at: new Date('2026-01-01T00:00:00.000Z') },
    })
    expect(selectedEarlier.published_at).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('always sets the fixed cluster_reason constant', () => {
    const metadata = deriveNewStoryMetadata({
      incomingPublishedAt: new Date('2026-01-01T00:00:00.000Z'),
      selectedItem: { title: undefined, published_at: new Date('2026-01-01T00:00:00.000Z') },
    })
    expect(metadata.cluster_reason).toBe(STORY_CLUSTER_REASON)
  })

  it('leaves title undefined when the selected member has no usable title', () => {
    const metadata = deriveNewStoryMetadata({
      incomingPublishedAt: new Date('2026-01-01T00:00:00.000Z'),
      selectedItem: { title: undefined, published_at: new Date('2026-01-01T00:00:00.000Z') },
    })
    expect(metadata.title).toBeUndefined()
  })
})
