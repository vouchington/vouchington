import { describe, expect, it } from 'vitest'
import { deriveNewStoryMetadata, normalizeStoryTitle, STORY_CLUSTER_REASON } from './metadata.mts'

describe('normalizeStoryTitle', () => {
  it('cleans markup and entities from an RSS title', () => {
    expect(normalizeStoryTitle('<b>Rates &amp; yields</b>\n  rise')).toBe('Rates & yields rise')
  })

  it('stores NULL, never an empty title, when nothing visible is left', () => {
    expect(normalizeStoryTitle(undefined)).toBeUndefined()
    expect(normalizeStoryTitle('')).toBeUndefined()
    expect(normalizeStoryTitle('<p>  </p>')).toBeUndefined()
  })

  it('truncates by code point so a surrogate pair is never split', () => {
    const title = normalizeStoryTitle('😀'.repeat(501))
    expect(Array.from(title!)).toHaveLength(500)
    expect(title).toBe('😀'.repeat(500))
  })

  it('keeps a title at the column cap whole', () => {
    expect(normalizeStoryTitle('a'.repeat(500))).toHaveLength(500)
  })
})

describe('deriveNewStoryMetadata', () => {
  const earlier = new Date('2026-01-01T00:00:00Z')
  const later = new Date('2026-01-02T00:00:00Z')

  it("titles the story from the chosen item and dates it from the earlier member's time", () => {
    expect(
      deriveNewStoryMetadata({
        incomingPublishedAt: later,
        selectedItem: { title: 'Chosen headline', published_at: earlier },
      }),
    ).toEqual({
      title: 'Chosen headline',
      published_at: earlier,
      cluster_reason: STORY_CLUSTER_REASON,
    })
  })

  it('takes the incoming item date when it is earlier than the chosen item', () => {
    expect(
      deriveNewStoryMetadata({
        incomingPublishedAt: earlier,
        selectedItem: { title: undefined, published_at: later },
      }),
    ).toMatchObject({ title: undefined, published_at: earlier })
  })
})
