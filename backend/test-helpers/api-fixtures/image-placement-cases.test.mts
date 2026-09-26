import { describe, expect, it } from 'vitest'
import { nativeUserProfileHeaderApiFixtureCases } from './native-user-profile-header-cases.mts'
import { swiftApiFixtureCases } from './swift-cases.mts'
import { webApiFixtureCases } from './web-cases.mts'

describe('saved image fixture identities', () => {
  it('provides canonical placement tuples for every surface consumer', () => {
    const cases = [
      ...nativeUserProfileHeaderApiFixtureCases,
      ...swiftApiFixtureCases,
      ...webApiFixtureCases,
    ]
    const surfaces = new Set<string>()
    const placements: object[] = []
    function inspect(value: unknown): void {
      if (!value || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value)) {
        if (key.endsWith('_placement') && child && typeof child === 'object') {
          placements.push(child)
          surfaces.add(key)
        }
        inspect(child)
      }
    }
    for (const fixture of cases) inspect(fixture.body)
    for (const placement of placements) {
      expect(placement).toMatchObject({
        image_id: expect.stringMatching(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/),
        placement_id: expect.stringMatching(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/),
        placement_revision: expect.any(Number),
      })
    }
    expect([...surfaces].sort()).toEqual([
      'banner_image_placement',
      'hero_image_placement',
      'image_placement',
      'logo_image_placement',
      'profile_image_placement',
    ])
    for (const id of [
      'swift.my.identity.default',
      'native.users.profile.default',
      'native.users.profile.restricted',
    ]) {
      const fixture = cases.find(candidate => candidate.id === id)
      expect(fixture?.body).toEqual(
        expect.objectContaining({
          [id.startsWith('swift') ? 'identity' : 'user']: expect.objectContaining({
            profile_image_placement: expect.any(Object),
          }),
        }),
      )
    }
  })
})
