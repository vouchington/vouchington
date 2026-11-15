import { describe, expect, it } from 'vitest'
import { createTestUserDirect, softDeleteUser } from '@voucha/test-helpers'
import {
  addDisposableEmailForUser,
  addVerifiedEmailForUser,
  setPrimaryEmailForUser,
} from '@voucha/test-helpers/entities/email-addresses'
import {
  getVerifiedEmailAddress,
  getVerifiedEmailAddressesBatch,
  hasVerifiedNonDisposableEmail,
  invalidateVerifiedEmailCache,
} from './email-verification.mts'

describe('verified email resolution', () => {
  it('keeps nullable primary flags at secondary priority and prefers a real primary', async () => {
    const user = await createTestUserDirect()
    const suffix = crypto.randomUUID()
    const nullable = `tests+nullable-${suffix}@voucha.ai`
    const secondary = `tests+secondary-${suffix}@voucha.ai`
    const primary = `tests+primary-${suffix}@voucha.ai`
    await addVerifiedEmailForUser(user.id, secondary)
    await addVerifiedEmailForUser(user.id, nullable, null)
    await expect(getVerifiedEmailAddress(user.id)).resolves.toBe(secondary)
    await setPrimaryEmailForUser(user.id, primary)
    await addVerifiedEmailForUser(user.id, `tests+later-null-${suffix}@voucha.ai`, null)
    await expect(getVerifiedEmailAddress(user.id)).resolves.toBe(primary)
  })

  it('finds a non-disposable secondary without changing the selected primary', async () => {
    const user = await createTestUserDirect()
    const suffix = crypto.randomUUID()
    const blockedDomain = `disposable-${suffix}.invalid`
    const primary = `primary@${blockedDomain}`
    await addDisposableEmailForUser(user.id, primary, blockedDomain)
    await setPrimaryEmailForUser(user.id, primary)
    await addVerifiedEmailForUser(user.id, `secondary@${blockedDomain}`)
    await invalidateVerifiedEmailCache(user.id)
    await expect(hasVerifiedNonDisposableEmail(user.id)).resolves.toBe(false)

    await addVerifiedEmailForUser(user.id, `tests+allowed-${suffix}@voucha.ai`)
    await invalidateVerifiedEmailCache(user.id)
    await expect(hasVerifiedNonDisposableEmail(user.id)).resolves.toBe(true)
    await expect(getVerifiedEmailAddress(user.id)).resolves.toBe(primary)
  })

  it('excludes deleted and unknown users from address and eligibility results', async () => {
    const user = await createTestUserDirect()
    await addVerifiedEmailForUser(user.id, `tests+deleted-${crypto.randomUUID()}@voucha.ai`)
    await softDeleteUser(user.id)
    await invalidateVerifiedEmailCache(user.id)
    const unknownId = crypto.randomUUID()
    await expect(getVerifiedEmailAddressesBatch([user.id, unknownId])).resolves.toEqual(
      new Map([
        [user.id, null],
        [unknownId, null],
      ]),
    )
    await expect(hasVerifiedNonDisposableEmail(user.id)).resolves.toBe(false)
    await expect(hasVerifiedNonDisposableEmail(unknownId)).resolves.toBe(false)
  })
})
