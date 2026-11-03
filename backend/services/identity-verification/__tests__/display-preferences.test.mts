import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  getUserVerificationState,
  setUserVerificationFields,
} from '@voucha/test-helpers'
import { invalidate } from '@services/entity-cache/invalidate'
import { updateDisplayPreferences } from '../display-preferences.mts'

async function createVerifiedUser() {
  const user = await createTestUser()
  await setUserVerificationFields(user.id, {
    verificationStatus: 'verified',
    verifiedBadgeVisible: true,
    publicVerifiedNameDisplay: 'hidden',
  })
  return user
}

describe('updateDisplayPreferences', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does nothing when no fields are provided', async () => {
    const user = await createVerifiedUser()
    const invalidateUsers = vi.spyOn(invalidate, 'users').mockResolvedValue()

    await updateDisplayPreferences(user.id, {})

    expect(invalidateUsers).not.toHaveBeenCalled()
    expect(await getUserVerificationState(user.id)).toMatchObject({
      is_verified_badge_visible: true,
      public_verified_name_display: 'hidden',
    })
  })

  it('updates is_verified_badge_visible only and invalidates the user cache', async () => {
    const user = await createVerifiedUser()
    const invalidateUsers = vi.spyOn(invalidate, 'users').mockResolvedValue()

    await updateDisplayPreferences(user.id, { is_verified_badge_visible: false })

    expect(await getUserVerificationState(user.id)).toMatchObject({
      is_verified_badge_visible: false,
      public_verified_name_display: 'hidden',
    })
    expect(invalidateUsers).toHaveBeenCalledExactlyOnceWith(user.id)
  })

  it('updates public_verified_name_display only and invalidates the user cache', async () => {
    const user = await createVerifiedUser()
    const invalidateUsers = vi.spyOn(invalidate, 'users').mockResolvedValue()

    await updateDisplayPreferences(user.id, { public_verified_name_display: 'first_name' })

    expect(await getUserVerificationState(user.id)).toMatchObject({
      is_verified_badge_visible: true,
      public_verified_name_display: 'first_name',
    })
    expect(invalidateUsers).toHaveBeenCalledExactlyOnceWith(user.id)
  })

  it('updates both fields at once', async () => {
    const user = await createVerifiedUser()
    const invalidateUsers = vi.spyOn(invalidate, 'users').mockResolvedValue()

    await updateDisplayPreferences(user.id, {
      is_verified_badge_visible: false,
      public_verified_name_display: 'full_name',
    })

    expect(await getUserVerificationState(user.id)).toMatchObject({
      is_verified_badge_visible: false,
      public_verified_name_display: 'full_name',
    })
    expect(invalidateUsers).toHaveBeenCalledExactlyOnceWith(user.id)
  })

  it.each(['hidden', 'first_name', 'first_name_last_initial', 'full_name'] as const)(
    'stores the %s public name display',
    async value => {
      const user = await createVerifiedUser()
      await setUserVerificationFields(user.id, {
        publicVerifiedNameDisplay: value === 'hidden' ? 'full_name' : 'hidden',
      })
      vi.spyOn(invalidate, 'users').mockResolvedValue()

      await updateDisplayPreferences(user.id, { public_verified_name_display: value })

      expect(await getUserVerificationState(user.id)).toMatchObject({
        public_verified_name_display: value,
      })
    },
  )

  it('changes nothing and skips invalidation for a user who is not verified', async () => {
    const user = await createTestUser()
    const before = (await getUserVerificationState(user.id))!
    const invalidateUsers = vi.spyOn(invalidate, 'users').mockResolvedValue()

    await updateDisplayPreferences(user.id, {
      is_verified_badge_visible: !before.is_verified_badge_visible,
    })

    expect(invalidateUsers).not.toHaveBeenCalled()
    expect(await getUserVerificationState(user.id)).toMatchObject({
      is_verified_badge_visible: before.is_verified_badge_visible,
    })
  })
})
