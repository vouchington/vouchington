import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { DSA_TEST_UUID } from '@voucha/test-helpers/dsa-transparency-database-fixtures'
import {
  expireTestDsaSubmissionLease,
  readTestDsaAttempts,
  readTestDsaSubmission,
  seedTestDsaDeadLetter,
  seedTestDsaFailureRound,
  seedTestDsaSubmission,
} from '@voucha/test-helpers/dsa-statement-submission-fixtures'
import { claimDsaStatementSubmission } from './dsa-statement-submission-claims.mts'
import { recordDsaStatementSubmissionResult } from './dsa-statement-submission-ledger.mts'
import { replayDsaStatementSubmission } from './dsa-statement-submission-replay.mts'

const from = new Date('2020-01-01T00:00:00.000Z')

async function submission(): Promise<string> {
  const image = await createTestCopyrightImageFixture('post-image')
  const restriction = await createTestCopyrightRestrictionForImage(image)
  return seedTestDsaSubmission(restriction.restrictionId)
}

function leaseToken(result: Awaited<ReturnType<typeof claimDsaStatementSubmission>>): string {
  if (result.kind !== 'claimed') throw new Error(`Expected claimed submission, got ${result.kind}`)
  return result.submission.leaseToken
}

describe('DSA submission claim and replay ledger', () => {
  it('fences a stale HTTP result after another worker reclaims an expired lease', async () => {
    const id = await submission()
    const oldToken = leaseToken(await claimDsaStatementSubmission(id, from))
    expect((await claimDsaStatementSubmission(id, from)).kind).toBe('not_claimable')
    await expireTestDsaSubmissionLease(id)
    const newToken = leaseToken(await claimDsaStatementSubmission(id, from))
    expect(newToken).not.toBe(oldToken)
    await expect(
      recordDsaStatementSubmissionResult({
        submissionId: id,
        leaseToken: oldToken,
        outcome: 'submitted',
        statusCode: 201,
        errorCode: null,
        responseUuid: DSA_TEST_UUID,
      }),
    ).resolves.toMatchObject({ recorded: false })
    expect(await readTestDsaAttempts(id)).toMatchObject([
      { attempt_number: 1, outcome: 'retryable_failure', error_code: 'lease_expired' },
    ])
    await expect(
      recordDsaStatementSubmissionResult({
        submissionId: id,
        leaseToken: newToken,
        outcome: 'submitted',
        statusCode: 201,
        errorCode: null,
        responseUuid: DSA_TEST_UUID,
      }),
    ).resolves.toMatchObject({ recorded: true })
    expect((await readTestDsaSubmission(id)).transparency_database_uuid).toBe(DSA_TEST_UUID)
    expect((await readTestDsaAttempts(id)).map(row => row.outcome)).toEqual([
      'retryable_failure',
      'submitted',
    ])
  })

  it('keeps prior rounds immutable and lets a second dead-letter round replay once', async () => {
    const id = await submission()
    const administrator = await createTestUser({ extraRoles: ['administrator'] })
    await seedTestDsaDeadLetter(id)
    const original = await readTestDsaAttempts(id)
    expect(await replayDsaStatementSubmission(administrator.id, id)).toBe(true)
    expect(await replayDsaStatementSubmission(administrator.id, id)).toBe(false)
    await seedTestDsaFailureRound(id, 7)
    expect((await claimDsaStatementSubmission(id, from)).kind).toBe('dead_lettered')
    expect(await replayDsaStatementSubmission(administrator.id, id)).toBe(true)
    const attempts = await readTestDsaAttempts(id)
    expect(attempts.slice(0, 5)).toEqual(original)
    expect(attempts.map(row => row.outcome)).toEqual([
      ...Array(5).fill('retryable_failure'),
      'replayed',
      ...Array(5).fill('retryable_failure'),
      'replayed',
    ])
    expect(attempts.at(-1)).toMatchObject({ attempt_number: 12, replayed_by_id: administrator.id })
    expect(await replayDsaStatementSubmission(administrator.id, id)).toBe(false)
    expect((await claimDsaStatementSubmission(id, from)).kind).toBe('claimed')
  })
})
