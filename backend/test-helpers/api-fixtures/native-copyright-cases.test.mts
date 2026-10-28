import { describe, expect, it } from 'vitest'
import { nativeCopyrightApiFixtureCases } from './native-copyright-cases.mts'
import { webCopyrightEmailIntakeApiFixtureCases } from './web-copyright-email-intake-cases.mts'

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

  it('publishes notice search and account labels to Swift and .NET contract consumers', () => {
    const search = webCopyrightEmailIntakeApiFixtureCases.find(
      fixture => fixture.id === 'web.copyright.email-notice-association-search',
    )
    const accounts = findFixture('native.copyright.repeat-infringer-accounts')
    for (const fixture of [search, accounts]) {
      expect(fixture?.consumers).toEqual(expect.arrayContaining(['swift-core', 'dotnet-core']))
    }
    expect(search?.body).toMatchObject({
      copyright_notices: [expect.objectContaining({ claimant_display_name: 'Claimant' })],
      page_info: { has_next_page: false },
    })
    expect(accounts.body).toMatchObject({
      copyright_repeat_infringer_accounts: [
        expect.objectContaining({ account_username: 'photo-author' }),
      ],
    })
  })
})

function findFixture(id: string) {
  const fixture = nativeCopyrightApiFixtureCases.find(candidate => candidate.id === id)
  if (!fixture) throw new Error(`Missing fixture ${id}`)
  return fixture
}
