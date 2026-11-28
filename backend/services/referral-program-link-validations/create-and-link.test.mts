import { beforeAll, it, describe, onTestFinished } from 'vitest'
import assert from 'node:assert/strict'
import {
  createReferralProgramLinkValidation,
  createTestUser,
  enableReferralProgramByTopicId,
  insertTestTopic,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { REFERRAL_LINK_VALIDATION_RULE_SET_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { referralLinkValidationLimitsConfig } from '@services/topics/referral-link-validation-limits'
import { linkValidationToReferralProgram } from '@services/topics/referral-programs'
import { createAndLinkValidationToReferralProgram } from './create-and-link.mts'

// Auth-guard and cap coverage. Happy-path, rollback, and 422 behaviors are covered
// at the HTTP integration level in backend/api/v1/topics/__tests__/topic.referral-program.part-2.test.mts.
describe('createAndLinkValidationToReferralProgram', () => {
  beforeAll(async () => {
    await referralLinkValidationLimitsConfig.waitForInitialization()
    await referralLinkValidationLimitsConfig.close()
  })

  it('throws 401 when currentUser is null', async () => {
    try {
      await createAndLinkValidationToReferralProgram(null, 'some-id', { slug: 'x' })
      assert.fail('Should have thrown')
    } catch (err: unknown) {
      assert.ok(err && typeof err === 'object' && 'status' in err)
      assert.equal(err.status, 401)
    }
  })

  it('throws 403 when currentUser is not an admin', async () => {
    const user = await createTestUser()
    try {
      await createAndLinkValidationToReferralProgram(user, 'some-id', { slug: 'x' })
      assert.fail('Should have thrown')
    } catch (err: unknown) {
      assert.ok(err && typeof err === 'object' && 'status' in err)
      assert.equal(err.status, 403)
    }
  })

  it('rejects linking a new rule set above rule_sets_per_program while keeping existing links idempotent', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(referralLinkValidationLimitsConfig, {
        rule_sets_per_program: 2,
      }),
    )
    const admin = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 10)
    const referralProgramId = await insertTestTopic({
      name: `Capped Referral Program ${suffix}`,
      slug: `capped-referral-program-${suffix}`,
      createdById: admin.id,
      topicType: 'referral_program',
    })
    await enableReferralProgramByTopicId(referralProgramId)

    const first = await createAndLinkValidationToReferralProgram(admin, referralProgramId, {
      slug: `cap_set_one_${suffix}`,
    })
    await createAndLinkValidationToReferralProgram(admin, referralProgramId, {
      slug: `cap_set_two_${suffix}`,
    })

    // Re-linking an already linked rule set remains idempotent even at the cap.
    await linkValidationToReferralProgram(admin, referralProgramId, first.id)

    const extraValidationId = await createReferralProgramLinkValidation(`cap_set_three_${suffix}`)
    await assert.rejects(
      () => linkValidationToReferralProgram(admin, referralProgramId, extraValidationId),
      (err: unknown) =>
        Boolean(
          err &&
          typeof err === 'object' &&
          'status' in err &&
          err.status === 409 &&
          'code' in err &&
          err.code === REFERRAL_LINK_VALIDATION_RULE_SET_LIMIT_REACHED,
        ),
    )

    await assert.rejects(
      () =>
        createAndLinkValidationToReferralProgram(admin, referralProgramId, {
          slug: `cap_set_four_${suffix}`,
        }),
      (err: unknown) =>
        Boolean(
          err &&
          typeof err === 'object' &&
          'status' in err &&
          err.status === 409 &&
          'code' in err &&
          err.code === REFERRAL_LINK_VALIDATION_RULE_SET_LIMIT_REACHED,
        ),
    )
  })
})
