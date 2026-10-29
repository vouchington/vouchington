import { describe, expect, it } from 'vitest'
import type { reviewedStaffCase } from './native-copyright-staff-form-review.mts'
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

  it('publishes inspectable staydown matches and unavailable context to Swift and .NET consumers', () => {
    const fixture = findFixture('web.copyright.staff-queue.default')
    expect(fixture.consumers).toEqual(expect.arrayContaining(['swift-core', 'dotnet-core']))
    const body = fixture.body as { copyright_notices: Array<typeof reviewedStaffCase> }
    const notice = body.copyright_notices.find(notice => notice.staydown_matches.length > 0)!
    expect(notice).toBeDefined()
    for (const reference of [...notice.action_intents, ...notice.staydown_matches]) {
      const target = notice.targets.find(target => target.id === reference.target_id)
      expect(target).toMatchObject({
        image_id: '00000000-0000-7000-8000-000000000820',
        hosted_use_url: 'https://voucha.ai/discussion/original-photograph',
      })
    }
    for (const match of notice.staydown_matches) {
      const target = notice.targets.find(target => target.id === match.target_id)
      expect(target?.image_id).toBe(match.registered_image_id)
    }
    expect(fixture.body).toMatchObject({
      copyright_notices: expect.arrayContaining([
        expect.objectContaining({
          action_intents: [
            expect.objectContaining({ target_id: '00000000-0000-7000-8000-000000000805' }),
          ],
          staydown_matches: [
            expect.objectContaining({
              uploaded_by_username: 'photo-author',
              target_id: '00000000-0000-7000-8000-000000000805',
              image_placement: {
                image_id: '00000000-0000-7000-8000-000000000819',
                placement_id: expect.any(String),
                placement_revision: 1,
              },
            }),
            expect.objectContaining({ uploaded_by_username: null, image_placement: null }),
          ],
        }),
      ]),
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
