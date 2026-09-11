import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import { createTestUser, createReferralProgramLinkValidation } from '@voucha/test-helpers'
import { createReferralLinkValidationRule } from './create.mts'
import { updateReferralLinkValidationRule } from './update.mts'
import type { PrivateUser } from '@services/users/types'

describe('update', () => {
  let adminUser: PrivateUser | null = null
  let validationId: string | null = null
  let ruleId: string | null = null

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })

    const randomSuffix = Math.random().toString(36).slice(7)
    validationId = await createReferralProgramLinkValidation(`update_validation_${randomSuffix}`)
    const rule = await createReferralLinkValidationRule(adminUser, validationId!, {
      hostname: 'example.com',
      pathname: '/refer',
      is_referral_link_url: true,
    })
    ruleId = rule.id
  })
  it('updateReferralLinkValidationRule requires user_error_text when disabling referral links', async () => {
    try {
      await updateReferralLinkValidationRule(adminUser, validationId!, ruleId!, {
        is_referral_link_url: false,
        user_error_text: null,
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 422)
    }
  })

  it('updateReferralLinkValidationRule requires user_error_text when marking invalid referral links', async () => {
    try {
      await updateReferralLinkValidationRule(adminUser, validationId!, ruleId!, {
        is_invalid_referral_link_url: true,
        user_error_text: null,
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 422)
    }
  })
})
