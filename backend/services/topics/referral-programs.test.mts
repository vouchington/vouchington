import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import { createReferralProgramLinkValidation, createTestUser } from '@voucha/test-helpers'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import {
  getReferralProgramAttributes,
  linkValidationToReferralProgram,
  unlinkValidationFromReferralProgram,
  updateReferralProgramAttributes,
} from './referral-programs.mts'
import type { Topic } from './types.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('referral-programs', () => {
  let user: PrivateUser
  let referralProgramId: string | null = null
  let companyTopicId: string | null = null

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })

    const randomSuffix = Math.random().toString(36).slice(7)
    referralProgramId = await insertTestTopic({
      name: `Test Referral Program ${randomSuffix}`,
      slug: `test-referral-program-${randomSuffix}`,
      createdById: user.id,
      topicType: 'referral_program',
    })
    companyTopicId = await insertTestTopic({
      name: `Test Company ${randomSuffix}`,
      slug: `test-company-${randomSuffix}`,
      createdById: user.id,
    })
  })
  it('getReferralProgramAttributes returns null for non-existent program', async () => {
    const topic = {
      id: referralProgramId!,
      topic_type: 'referral_program' as const,
    } as unknown as Topic

    const attributes = await getReferralProgramAttributes(topic)
    assert.equal(attributes, null)
  })

  it('updateReferralProgramAttributes creates new attributes', async () => {
    const topic = {
      id: referralProgramId!,
      topic_type: 'referral_program' as const,
    } as unknown as Topic

    const attributes = await updateReferralProgramAttributes(user, topic, {
      company_id: companyTopicId,
    })

    assert.ok(attributes)
    assert.equal(attributes.company_id, companyTopicId)
  })

  it('getReferralProgramAttributes returns existing attributes', async () => {
    const topic = {
      id: referralProgramId!,
      topic_type: 'referral_program' as const,
    } as unknown as Topic

    const attributes = await getReferralProgramAttributes(topic)

    assert.ok(attributes)
    assert.equal(attributes.company_id, companyTopicId)
  })

  it('updateReferralProgramAttributes updates existing attributes', async () => {
    const topic = {
      id: referralProgramId!,
      topic_type: 'referral_program' as const,
    } as unknown as Topic

    const attributes = await updateReferralProgramAttributes(user, topic, {
      company_id: null,
    })

    assert.ok(attributes)
    assert.equal(attributes.company_id, null)
  })

  it('updateReferralProgramAttributes rejects unauthenticated users', async () => {
    const topic = {
      id: referralProgramId!,
      topic_type: 'referral_program' as const,
    } as unknown as Topic

    try {
      await updateReferralProgramAttributes(null, topic, { company_id: companyTopicId })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 401)
    }
  })

  it('updateReferralProgramAttributes rejects non-referral-program topics', async () => {
    const nonReferralTopic = {
      id: companyTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    try {
      await updateReferralProgramAttributes(user, nonReferralTopic, { company_id: companyTopicId })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 400)
    }
  })

  it('unlinkValidationFromReferralProgram unlinks a validation from a referral program', async () => {
    const random = Math.random().toString(36).slice(7)
    const validationId = await createReferralProgramLinkValidation(`unlink_svc_test_${random}`)
    const topic = {
      id: referralProgramId!,
      topic_type: 'referral_program' as const,
    } as unknown as Topic

    await linkValidationToReferralProgram(user, referralProgramId!, validationId)
    const linked = await getReferralProgramAttributes(topic)
    assert.ok(linked?.referral_program_link_validation_ids?.includes(validationId))

    await unlinkValidationFromReferralProgram(user, referralProgramId!, validationId)
    const unlinked = await getReferralProgramAttributes(topic)
    assert.ok(!unlinked?.referral_program_link_validation_ids?.includes(validationId))
  })

  it('unlinkValidationFromReferralProgram rejects unauthenticated users', async () => {
    try {
      await unlinkValidationFromReferralProgram(
        null,
        referralProgramId!,
        '00000000-0000-0000-0000-000000000001',
      )
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 401)
    }
  })

  it('unlinkValidationFromReferralProgram rejects non-admin users', async () => {
    const nonAdmin = await createTestUser()
    try {
      await unlinkValidationFromReferralProgram(
        nonAdmin,
        referralProgramId!,
        '00000000-0000-0000-0000-000000000001',
      )
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 403)
    }
  })
})
