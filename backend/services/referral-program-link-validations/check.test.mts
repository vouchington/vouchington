import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import {
  assignValidationToReferralProgram,
  createReferralProgramLinkValidation,
  createReferralProgramLinkValidationRule,
  createTestUser,
  enableReferralProgramByTopicId,
  insertTestTopic,
} from '@voucha/test-helpers'
import { isUrlReferralLink } from './check.mts'
import type { PrivateUser } from '@services/users/types'

describe('check', () => {
  let user: PrivateUser
  let userId: string | null = null
  let referralProgramId: string | null = null
  let validationId: string | null = null
  let randomSuffix: string

  beforeAll(async () => {
    user = await createTestUser()
    userId = user.id

    randomSuffix = Math.random().toString(36).slice(7)

    referralProgramId = await insertTestTopic({
      name: `Test Referral Program ${randomSuffix}`,
      slug: `test-referral-program-${randomSuffix}`,
      createdById: userId!,
      topicType: 'referral_program',
    })
    validationId = await createReferralProgramLinkValidation(`test_validation_${randomSuffix}`)
    await enableReferralProgramByTopicId(referralProgramId)
    await assignValidationToReferralProgram(referralProgramId, validationId)
  })
  it('valid referral link with exact hostname and pathname match', async () => {
    await createReferralProgramLinkValidationRule({
      validationId: validationId!,
      hostname: `example-${randomSuffix}.com`,
      pathname: '/refer',
    })
    const result = await isUrlReferralLink(`https://example-${randomSuffix}.com/refer`)

    assert.equal(result.is_valid, true)
    assert.equal(result.referral_program_id, referralProgramId)
    assert.equal(result.topic_id, referralProgramId)
    assert.equal(result.user_error_text, null)
  })

  it('invalid URL string returns error', async () => {
    const result = await isUrlReferralLink('not-a-valid-url')

    assert.equal(result.is_valid, false)
    assert.equal(result.user_error_text, 'Invalid URL or URL must use HTTPS')
  })

  it('fragment-bearing referral URL returns error', async () => {
    const result = await isUrlReferralLink(`https://example-${randomSuffix}.com/refer#invite`)

    assert.equal(result.is_valid, false)
    assert.equal(result.user_error_text, 'URL fragments are not supported')
  })

  it('referral program supports multiple linked validations', async () => {
    const suffix = Math.random().toString(36).slice(7)
    const extraValidationId = await createReferralProgramLinkValidation(
      `extra_validation_${suffix}`,
    )
    await assignValidationToReferralProgram(referralProgramId!, extraValidationId)

    await createReferralProgramLinkValidationRule({
      validationId: extraValidationId,
      hostname: 'multi.example.com',
      pathname: '/deal',
    })
    const result = await isUrlReferralLink('https://multi.example.com/deal', {
      referral_program_id: referralProgramId!,
    })

    assert.equal(result.is_valid, true)
    assert.equal(result.referral_program_id, referralProgramId)
  })

  it('referral_program_id filter scopes matching to the requested program', async () => {
    const suffix = Math.random().toString(36).slice(7)
    const otherReferralProgramId = await insertTestTopic({
      name: `Other Referral Program ${suffix}`,
      slug: `other-referral-program-${suffix}`,
      createdById: userId!,
      topicType: 'referral_program',
    })
    await enableReferralProgramByTopicId(otherReferralProgramId)

    const otherValidationId = await createReferralProgramLinkValidation(
      `other_validation_${suffix}`,
    )
    await assignValidationToReferralProgram(otherReferralProgramId, otherValidationId)

    await createReferralProgramLinkValidationRule({
      validationId: otherValidationId,
      hostname: 'example.com',
      pathname: '/refer',
    })
    const result = await isUrlReferralLink('https://example.com/refer', {
      referral_program_id: otherReferralProgramId,
    })

    assert.equal(result.is_valid, true)
    assert.equal(result.referral_program_id, otherReferralProgramId)
  })

  it('is_referral_link_url = false returns invalid with user error text', async () => {
    await createReferralProgramLinkValidationRule({
      validationId: validationId!,
      hostname: 'notareferrallink.com',
      pathname: '/page',
      isReferralLinkUrl: false,
      userErrorText: 'This URL is not a referral link',
    })
    const result = await isUrlReferralLink('https://notareferrallink.com/page')

    assert.equal(result.is_valid, false)
    assert.equal(result.topic_id, null)
    assert.equal(result.referral_program_id, null)
    assert.equal(result.user_error_text, 'This URL is not a referral link')
  })

  it('is_invalid_referral_link_url = true returns invalid with topic and program IDs', async () => {
    await createReferralProgramLinkValidationRule({
      validationId: validationId!,
      hostname: `invalid-${randomSuffix}.example.com`,
      pathname: '/bad-link',
      isReferralLinkUrl: true,
      isInvalidReferralLinkUrl: true,
      userErrorText: 'This referral link violates our terms',
    })
    const result = await isUrlReferralLink(`https://invalid-${randomSuffix}.example.com/bad-link`)

    assert.equal(result.is_valid, false)
    assert.equal(result.topic_id, referralProgramId)
    assert.equal(result.referral_program_id, referralProgramId)
    assert.equal(result.user_error_text, 'This referral link violates our terms')
  })

  it('no rules matched returns invalid with null user_error_text', async () => {
    const result = await isUrlReferralLink('https://nomatch.example.com/path')

    assert.equal(result.is_valid, false)
    assert.equal(result.topic_id, null)
    assert.equal(result.referral_program_id, null)
    assert.equal(result.user_error_text, null)
  })
})
