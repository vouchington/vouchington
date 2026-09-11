import { it, describe } from 'vitest'
import assert from 'node:assert/strict'
import { createTestUser } from '@voucha/test-helpers'
import { createAndLinkValidationToReferralProgram } from './create-and-link.mts'

// Auth-guard coverage only. Happy-path, rollback, and 422 behaviors are covered
// at the HTTP integration level in backend/api/v1/topics/__tests__/topic.referral-program.part-2.test.mts.
describe('createAndLinkValidationToReferralProgram', () => {
  it('throws 401 when currentUser is null', async () => {
    try {
      await createAndLinkValidationToReferralProgram(null, 'some-id', { slug: 'x' })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 401)
    }
  })

  it('throws 403 when currentUser is not an admin', async () => {
    const user = await createTestUser()
    try {
      await createAndLinkValidationToReferralProgram(user, 'some-id', { slug: 'x' })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 403)
    }
  })
})
