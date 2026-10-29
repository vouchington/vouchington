import { describe, expect, it } from 'vitest'
import { deriveNewStoryMetadata } from './metadata.mts'

describe('deriveNewStoryMetadata', () => {
  const earlier = new Date('2026-01-01T00:00:00Z')
  const later = new Date('2026-01-02T00:00:00Z')

  it('cleans markup and entities from the chosen RSS headline', () => {
    const metadata = deriveNewStoryMetadata({
      incomingPublishedAt: later,
      selectedItem: { title: '<b>Rates &amp; yields</b>\n  rise', published_at: earlier },
    })
    expect(metadata.title).toBe('Rates & yields rise')
  })

  it('stores NULL, never an empty title, when nothing visible is left', () => {
    for (const title of [undefined, '', '<p>  </p>']) {
      const metadata = deriveNewStoryMetadata({
        incomingPublishedAt: later,
        selectedItem: { title, published_at: earlier },
      })
      expect(metadata.title).toBeUndefined()
    }
  })

  it('truncates by code point so a surrogate pair is never split', () => {
    const metadata = deriveNewStoryMetadata({
      incomingPublishedAt: later,
      selectedItem: { title: '😀'.repeat(501), published_at: earlier },
    })
    expect(Array.from(metadata.title!)).toHaveLength(500)
    expect(metadata.title).toBe('😀'.repeat(500))
  })

  it('keeps a title at the column cap whole', () => {
    const metadata = deriveNewStoryMetadata({
      incomingPublishedAt: later,
      selectedItem: { title: 'a'.repeat(500), published_at: earlier },
    })
    expect(metadata.title).toBe('a'.repeat(500))
  })

  it("titles the story from the chosen item and dates it from the earlier member's time", () => {
    expect(
      deriveNewStoryMetadata({
        incomingPublishedAt: later,
        selectedItem: { title: 'Chosen headline', published_at: earlier },
      }),
    ).toEqual({
      title: 'Chosen headline',
      published_at: earlier,
      cluster_reason: expect.stringMatching(/\S/),
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
