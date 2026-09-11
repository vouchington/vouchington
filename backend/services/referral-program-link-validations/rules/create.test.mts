import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import { createTestUser, createReferralProgramLinkValidation } from '@voucha/test-helpers'
import { randomUUID } from 'node:crypto'
import { createReferralLinkValidationRule } from './create.mts'
import type { PrivateUser } from '@services/users/types'

describe('create', () => {
  let adminUser: PrivateUser | null = null
  let validationId: string | null = null

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })

    const randomSuffix = Math.random().toString(36).slice(7)
    validationId = await createReferralProgramLinkValidation(`test_validation_${randomSuffix}`)
  })
  it('createReferralLinkValidationRule creates rule with valid data', async () => {
    const rule = await createReferralLinkValidationRule(adminUser, validationId!, {
      hostname: 'example.com',
      pathname: '/refer',
      is_referral_link_url: true,
    })
    assert.ok(rule.id)
    assert.equal(rule.hostname, 'example.com')
    assert.equal(rule.pathname, '/refer')
    assert.equal(rule.is_referral_link_url, true)
  })

  it('createReferralLinkValidationRule requires user_error_text when is_referral_link_url is false', async () => {
    try {
      await createReferralLinkValidationRule(adminUser, validationId!, {
        hostname: 'example.com',
        pathname: '/not-referral',
        is_referral_link_url: false,
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 422)
    }
  })

  it('createReferralLinkValidationRule requires user_error_text when is_invalid_referral_link_url is true', async () => {
    try {
      await createReferralLinkValidationRule(adminUser, validationId!, {
        hostname: 'example.com',
        pathname: '/redirect',
        is_invalid_referral_link_url: true,
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 422)
    }
  })

  it('createReferralLinkValidationRule normalizes hostname to lowercase', async () => {
    const rule = await createReferralLinkValidationRule(adminUser, validationId!, {
      hostname: 'EXAMPLE.COM',
      pathname: '/refer',
    })
    assert.equal(rule.hostname, 'example.com')
  })

  it('createReferralLinkValidationRule requires admin role', async () => {
    const nonAdminUser = await createTestUser()
    try {
      await createReferralLinkValidationRule(nonAdminUser, validationId!, {
        hostname: 'example.com',
        pathname: '/refer',
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 403)
    }
  })

  it('createReferralLinkValidationRule returns 422 for unknown validation id', async () => {
    try {
      await createReferralLinkValidationRule(adminUser, randomUUID(), {
        hostname: 'example.com',
        pathname: '/refer',
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 422)
    }
  })
})
