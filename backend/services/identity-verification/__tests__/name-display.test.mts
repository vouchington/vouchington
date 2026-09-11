import { describe, it, expect } from 'vitest'
import { computeVerifiedDisplayName } from '../name-display.mts'

function baseUser(overrides: Partial<Parameters<typeof computeVerifiedDisplayName>[0]> = {}) {
  return {
    verification_status: 'verified',
    verified_badge_visible: true,
    public_verified_name_display: 'hidden',
    verified_first_name: 'Alice',
    verified_last_name_initial: 'S',
    verified_full_name: 'Alice Smith',
    ...overrides,
  }
}

describe('computeVerifiedDisplayName', () => {
  it('returns null when verification_status is not verified', () => {
    expect(computeVerifiedDisplayName(baseUser({ verification_status: 'unverified' }))).toBeNull()
    expect(computeVerifiedDisplayName(baseUser({ verification_status: 'failed' }))).toBeNull()
    expect(
      computeVerifiedDisplayName(baseUser({ verification_status: 'identity_pending' })),
    ).toBeNull()
  })

  it('returns null when verified_badge_visible is false', () => {
    expect(computeVerifiedDisplayName(baseUser({ verified_badge_visible: false }))).toBeNull()
  })

  it('returns null for hidden display mode', () => {
    expect(
      computeVerifiedDisplayName(baseUser({ public_verified_name_display: 'hidden' })),
    ).toBeNull()
  })

  it('returns first name for first_name display mode', () => {
    expect(
      computeVerifiedDisplayName(baseUser({ public_verified_name_display: 'first_name' })),
    ).toBe('Alice')
  })

  it('returns null for first_name mode when first name is missing', () => {
    expect(
      computeVerifiedDisplayName(
        baseUser({ public_verified_name_display: 'first_name', verified_first_name: null }),
      ),
    ).toBeNull()
  })

  it('returns "First I." for first_name_last_initial mode', () => {
    expect(
      computeVerifiedDisplayName(
        baseUser({ public_verified_name_display: 'first_name_last_initial' }),
      ),
    ).toBe('Alice S.')
  })

  it('returns just first name when last initial is missing in first_name_last_initial mode', () => {
    expect(
      computeVerifiedDisplayName(
        baseUser({
          public_verified_name_display: 'first_name_last_initial',
          verified_last_name_initial: null,
        }),
      ),
    ).toBe('Alice')
  })

  it('returns null for first_name_last_initial mode when first name is missing', () => {
    expect(
      computeVerifiedDisplayName(
        baseUser({
          public_verified_name_display: 'first_name_last_initial',
          verified_first_name: null,
        }),
      ),
    ).toBeNull()
  })

  it('returns full name for full_name display mode', () => {
    expect(
      computeVerifiedDisplayName(baseUser({ public_verified_name_display: 'full_name' })),
    ).toBe('Alice Smith')
  })

  it('returns null for full_name mode when full name is missing', () => {
    expect(
      computeVerifiedDisplayName(
        baseUser({ public_verified_name_display: 'full_name', verified_full_name: null }),
      ),
    ).toBeNull()
  })

  it('returns null for hidden when badge is not visible even if verified', () => {
    const user = baseUser({
      public_verified_name_display: 'full_name',
      verified_badge_visible: false,
    })
    expect(computeVerifiedDisplayName(user)).toBeNull()
  })
})
