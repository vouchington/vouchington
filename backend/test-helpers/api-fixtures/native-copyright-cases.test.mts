import { describe, expect, it } from 'vitest'
import { nativeCopyrightApiFixtureCases } from './native-copyright-cases.mts'

describe('native copyright fixtures', () => {
  it('publishes stable media-placement fields for post images', () => {
    const fixture = findFixture('native.posts.images.placement.default')
    expect(fixture.body).toEqual({
      images: [
        expect.objectContaining({
          image_id: expect.any(String),
          placement_id: expect.any(String),
          placement_revision: expect.any(Number),
        }),
      ],
    })
  })

  it('publishes the staff image-similarity candidate contract', () => {
    const fixture = findFixture('native.moderation.copyright.image-similarity-candidates.default')
    expect(fixture.auth).toBe('fixture-admin')
    expect(fixture.body).toEqual({
      availability: 'available',
      copyright_image_similarity_candidates: [
        expect.objectContaining({
          image_id: expect.any(String),
          placement_id: expect.any(String),
          placement_revision: expect.any(Number),
          post_id: expect.any(String),
          similarity: expect.any(Number),
        }),
      ],
    })
  })
})

function findFixture(id: string) {
  const fixture = nativeCopyrightApiFixtureCases.find(candidate => candidate.id === id)
  if (!fixture) throw new Error(`Missing fixture ${id}`)
  return fixture
}
