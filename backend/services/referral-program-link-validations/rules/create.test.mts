import { it, beforeAll, describe, onTestFinished } from 'vitest'
import assert from 'node:assert/strict'
import { createTestUser, createReferralProgramLinkValidation } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { randomUUID } from 'node:crypto'
import { REFERRAL_LINK_VALIDATION_RULE_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { referralLinkValidationLimitsConfig } from '@services/topics/referral-link-validation-limits'
import { createReferralLinkValidationRule } from './create.mts'
import { upsertReferralLinkValidationRule } from './upsert.mts'
import type { PrivateUser } from '@services/users/types'

describe('create', () => {
  let adminUser: PrivateUser | null = null
  let validationId: string | null = null

  beforeAll(async () => {
    await referralLinkValidationLimitsConfig.waitForInitialization()
    await referralLinkValidationLimitsConfig.close()
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
    } catch (err: unknown) {
      assert.ok(err && typeof err === 'object' && 'status' in err)
      assert.equal(err.status, 422)
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
    } catch (err: unknown) {
      assert.ok(err && typeof err === 'object' && 'status' in err)
      assert.equal(err.status, 422)
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
    } catch (err: unknown) {
      assert.ok(err && typeof err === 'object' && 'status' in err)
      assert.equal(err.status, 403)
    }
  })

  it('createReferralLinkValidationRule returns 422 for unknown validation id', async () => {
    try {
      await createReferralLinkValidationRule(adminUser, randomUUID(), {
        hostname: 'example.com',
        pathname: '/refer',
      })
      assert.fail('Should have thrown')
    } catch (err: unknown) {
      assert.ok(err && typeof err === 'object' && 'status' in err)
      assert.equal(err.status, 422)
    }
  })

  it('rejects creating or upserting a new rule above rules_per_rule_set while keeping existing upserts idempotent', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(referralLinkValidationLimitsConfig, {
        rules_per_rule_set: 2,
      }),
    )
    const cappedValidationId = await createReferralProgramLinkValidation(
      `test_capped_rules_${Math.random().toString(36).slice(2, 10)}`,
    )
    const first = await createReferralLinkValidationRule(adminUser, cappedValidationId, {
      hostname: 'example.com',
      pathname: '/one',
    })
    await upsertReferralLinkValidationRule(cappedValidationId, {
      hostname: 'example.com',
      pathname: '/two',
    })

    const existing = await upsertReferralLinkValidationRule(cappedValidationId, {
      hostname: 'example.com',
      pathname: '/one',
    })
    assert.equal(existing.id, first.id)

    await assert.rejects(
      () =>
        createReferralLinkValidationRule(adminUser, cappedValidationId, {
          hostname: 'example.com',
          pathname: '/three',
        }),
      (err: unknown) =>
        Boolean(
          err &&
          typeof err === 'object' &&
          'status' in err &&
          err.status === 409 &&
          'code' in err &&
          err.code === REFERRAL_LINK_VALIDATION_RULE_LIMIT_REACHED,
        ),
    )

    await assert.rejects(
      () =>
        upsertReferralLinkValidationRule(cappedValidationId, {
          hostname: 'example.com',
          pathname: '/four',
        }),
      (err: unknown) =>
        Boolean(
          err &&
          typeof err === 'object' &&
          'status' in err &&
          err.status === 409 &&
          'code' in err &&
          err.code === REFERRAL_LINK_VALIDATION_RULE_LIMIT_REACHED,
        ),
    )
  })
})
