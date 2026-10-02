import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  WEB_PROVENANCE,
  createTestUser,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createReferralProgramFixture } from '@voucha/test-helpers/entities/referral-programs'
import {
  createUserReferralLink,
  deactivateUserReferralLink,
  getUserReferralLink,
} from '@services/user-referral-program-links'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'

describe('referral link activation suspension guards', () => {
  const suspendedUserIds: string[] = []
  let referralProgramId: string
  let hostname: string

  beforeAll(async () => {
    const fixture = await createReferralProgramFixture({ createdById: (await createTestUser()).id })
    referralProgramId = fixture.referralProgramId
    hostname = fixture.hostname
  })

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it.each([
    ['POST', 'deactivated'],
    ['DELETE', 'active'],
  ] as const)(
    '%s /api/v1/referral-links/:linkId/activations refuses a suspended user and leaves an %s link untouched',
    async (method, startingState) => {
      const user = await createTestUser()
      const link = await createUserReferralLink(user, WEB_PROVENANCE, {
        user_id: user.id,
        referral_program_id: referralProgramId,
        url: `https://${hostname}/ref/${crypto.randomUUID().slice(0, 8)}`,
      })
      if (startingState === 'deactivated') await deactivateUserReferralLink(user, link.id)
      const before = await getUserReferralLink(link.id)
      await suspendTestUser(user.id)
      suspendedUserIds.push(user.id)
      const request = createRequest()
      await request.authenticateAs(user)
      const path = `/api/v1/referral-links/${link.id}/activations`

      const response = method === 'POST' ? await request.post(path) : await request.delete(path)

      expect(response.status).toBe(403)
      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
      expect(await getUserReferralLink(link.id)).toEqual(before)
    },
  )
})
