import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import {
  createTestUser,
  insertTestTopic,
  enableReferralProgramByTopicId,
  createReferralProgramLinkValidation,
  assignValidationToReferralProgram,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { listReferralLinkValidationsForProgram } from './index.mts'

describe('listReferralLinkValidationsForProgram', () => {
  let adminUser: PrivateUser | null = null

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
  })

  it('returns validations linked to the program, ordered by slug', async () => {
    const suffix = Math.random().toString(36).slice(7)

    const programId = await insertTestTopic({
      name: `Test Referral Program ${suffix}`,
      slug: `test-referral-program-${suffix}`,
      createdById: adminUser!.id,
      topicType: 'referral_program',
    })
    // topics__referral_program_link_validations.referral_program_id FK references
    // topics__referral_programs.topic_id, so we must register this topic as a referral program.
    await enableReferralProgramByTopicId(programId)

    const v1Id = await createReferralProgramLinkValidation(`aaa_valid_${suffix}`, 'Help text 1')
    const v2Id = await createReferralProgramLinkValidation(`bbb_valid_${suffix}`, 'Help text 2')
    // v3 is created but NOT linked
    await createReferralProgramLinkValidation(`ccc_valid_${suffix}`, 'Help text 3')

    await assignValidationToReferralProgram(programId, v1Id)
    await assignValidationToReferralProgram(programId, v2Id)

    const results = await listReferralLinkValidationsForProgram(programId)

    const ids = results.map(v => v.id)
    assert.ok(ids.includes(v1Id), 'v1 should be present')
    assert.ok(ids.includes(v2Id), 'v2 should be present')
    assert.equal(ids.length, 2, 'should return exactly 2 validations')

    // Results should be ordered by slug ASC
    const slugs = results.map(v => v.slug)
    assert.deepEqual(slugs, [...slugs].sort(), 'results should be ordered by slug ASC')
  })

  it('returns empty array for a program with no linked validations', async () => {
    const suffix = Math.random().toString(36).slice(7)

    const programId = await insertTestTopic({
      name: `Empty Referral Program ${suffix}`,
      slug: `empty-referral-program-${suffix}`,
      createdById: adminUser!.id,
      topicType: 'referral_program',
    })
    await enableReferralProgramByTopicId(programId)

    const results = await listReferralLinkValidationsForProgram(programId)
    assert.deepEqual(results, [])
  })

  it('throws 422 for an invalid UUID', async () => {
    try {
      await listReferralLinkValidationsForProgram('not-a-uuid')
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 422)
    }
  })
})
