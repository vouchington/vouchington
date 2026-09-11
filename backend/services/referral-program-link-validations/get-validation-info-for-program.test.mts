import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import {
  assignValidationToReferralProgram,
  createReferralProgramLinkValidation,
  createReferralProgramLinkValidationRule,
  createTestUser,
  enableReferralProgramByTopicId,
  insertReferralProgramValidationRuleWithExamplesForTest,
  insertTestTopic,
} from '@voucha/test-helpers'
import { getValidationInfoForReferralProgram } from './get-validation-info-for-program.mts'
import type { PrivateUser } from '@services/users/types'

describe('getValidationInfoForReferralProgram', () => {
  let user: PrivateUser
  let userId: string

  beforeAll(async () => {
    user = await createTestUser()
    userId = user.id
  })

  it('returns null when no validation rules are linked to the program', async () => {
    const randomSuffix = Math.random().toString(36).slice(7)

    const referralProgramId = await insertTestTopic({
      name: `Test Referral Program ${randomSuffix}`,
      slug: `test-referral-program-${randomSuffix}`,
      createdById: userId,
      topicType: 'referral_program',
    })
    await enableReferralProgramByTopicId(referralProgramId)

    const result = await getValidationInfoForReferralProgram(referralProgramId)
    assert.equal(result, null)
  })

  it('returns validation info when linked rules exist with example_urls', async () => {
    const randomSuffix = Math.random().toString(36).slice(7)

    const referralProgramId = await insertTestTopic({
      name: `Test Referral Program ${randomSuffix}`,
      slug: `test-referral-program-${randomSuffix}`,
      createdById: userId,
      topicType: 'referral_program',
    })
    await enableReferralProgramByTopicId(referralProgramId)

    const validationId = await createReferralProgramLinkValidation(
      `test_validation_${randomSuffix}`,
      'Find your link in Account settings',
    )
    await assignValidationToReferralProgram(referralProgramId, validationId)

    await createReferralProgramLinkValidationRule({
      validationId,
      hostname: `bank-${randomSuffix}.com`,
      pathname: '/ref/%',
      isReferralLinkUrl: true,
    })

    await insertReferralProgramValidationRuleWithExamplesForTest({
      validationId,
      hostname: `bank-example-${randomSuffix}.com`,
      pathname: '/ref/%',
      isReferralLinkUrl: true,
      exampleUrls: ['https://bank.com/ref/you'],
    })

    const result = await getValidationInfoForReferralProgram(referralProgramId)
    assert.ok(result !== null)
    assert.equal(result.user_help_text, 'Find your link in Account settings')
    assert.ok(Array.isArray(result.example_urls))
    assert.ok(result.example_urls.includes('https://bank.com/ref/you'))
  })

  it('excludes blocked rules (is_invalid_referral_link_url = true) from example_urls', async () => {
    const randomSuffix = Math.random().toString(36).slice(7)

    const referralProgramId = await insertTestTopic({
      name: `Test Referral Program ${randomSuffix}`,
      slug: `test-referral-program-${randomSuffix}`,
      createdById: userId,
      topicType: 'referral_program',
    })
    await enableReferralProgramByTopicId(referralProgramId)

    const validationId = await createReferralProgramLinkValidation(
      `test_validation_blocked_${randomSuffix}`,
      'Find your link in Account settings',
    )
    await assignValidationToReferralProgram(referralProgramId, validationId)

    await insertReferralProgramValidationRuleWithExamplesForTest({
      validationId,
      hostname: `blocked-${randomSuffix}.com`,
      pathname: '/ref/%',
      isReferralLinkUrl: true,
      isInvalidReferralLinkUrl: true,
      userErrorText: 'This URL is blocked',
      exampleUrls: ['https://blocked.com/ref/you'],
    })

    const result = await getValidationInfoForReferralProgram(referralProgramId)
    assert.equal(result, null)
  })

  it('returns null when linked rules have no example_urls', async () => {
    const randomSuffix = Math.random().toString(36).slice(7)

    const referralProgramId = await insertTestTopic({
      name: `Test Referral Program ${randomSuffix}`,
      slug: `test-referral-program-${randomSuffix}`,
      createdById: userId,
      topicType: 'referral_program',
    })
    await enableReferralProgramByTopicId(referralProgramId)

    const validationId = await createReferralProgramLinkValidation(
      `test_validation_no_examples_${randomSuffix}`,
      'Help text without examples',
    )
    await assignValidationToReferralProgram(referralProgramId, validationId)

    // Rule with no example_urls (null)
    await createReferralProgramLinkValidationRule({
      validationId,
      hostname: `no-examples-${randomSuffix}.com`,
      pathname: '/ref/%',
      isReferralLinkUrl: true,
    })

    const result = await getValidationInfoForReferralProgram(referralProgramId)
    assert.equal(result, null)
  })
})
