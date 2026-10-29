import { describe, expect, it } from 'vitest'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import {
  makeTestDsaSubmissionDue,
  readTestDsaSubmission,
  seedTestDsaSubmission,
} from '@voucha/test-helpers/dsa-statement-submission-fixtures'
import {
  readCopyrightDsaBuildFailure,
  readCopyrightDsaRetentionClock,
  readCopyrightDsaSubmissionMaintenance,
  seedCopyrightDsaPermanentFailureAttemptAt,
} from '@voucha/test-helpers/copyright-retention-dsa-activity'
import { claimDsaStatementSubmission } from './dsa-statement-submission-claims.mts'
import { recordDsaStatementBuildFailure } from './dsa-statement-submission-build-failure.mts'

const SWEEP_START = new Date('2000-01-01T00:00:00.000Z')

async function createRestrictedNotice() {
  const image = await createTestCopyrightImageFixture('post-image')
  return createTestCopyrightRestrictionForImage(image)
}

describe('copyright DSA activity retention clock', () => {
  it('does not advance for due-time and lease maintenance', async () => {
    const restriction = await createRestrictedNotice()
    const submissionId = await seedTestDsaSubmission(restriction.restrictionId)
    const beforeClock = await readCopyrightDsaRetentionClock(restriction.noticeId)
    const beforeSubmission = await readCopyrightDsaSubmissionMaintenance(submissionId)
    expect(beforeClock.dsa_activity_at).toBeNull()

    await makeTestDsaSubmissionDue(submissionId)
    await expect(claimDsaStatementSubmission(submissionId, SWEEP_START)).resolves.toMatchObject({
      kind: 'claimed',
    })

    const [afterClock, afterSubmission] = await Promise.all([
      readCopyrightDsaRetentionClock(restriction.noticeId),
      readCopyrightDsaSubmissionMaintenance(submissionId),
    ])
    expect(afterSubmission.available_at.getTime()).toBeLessThan(
      beforeSubmission.available_at.getTime(),
    )
    expect(afterSubmission.lease_token).not.toBeNull()
    expect(afterSubmission.updated_at.getTime()).toBeGreaterThanOrEqual(
      beforeSubmission.updated_at.getTime(),
    )
    expect(afterClock).toEqual(beforeClock)
  })

  it('advances the shared case clock for a payload-build failure', async () => {
    const restriction = await createRestrictedNotice()
    await expect(
      recordDsaStatementBuildFailure(restriction.restrictionId, SWEEP_START, 'http_422'),
    ).resolves.toBe(true)

    const [failure, clock] = await Promise.all([
      readCopyrightDsaBuildFailure(restriction.restrictionId),
      readCopyrightDsaRetentionClock(restriction.noticeId),
    ])
    expect(clock.dsa_activity_at).toEqual(failure.failed_at)
    expect(clock.projected_clock).toEqual(failure.failed_at)
  })

  it('uses the immutable UUIDv7 time of a terminal attempt as case activity', async () => {
    const restriction = await createRestrictedNotice()
    const submissionId = await seedTestDsaSubmission(restriction.restrictionId)
    const occurredAt = new Date('2032-06-15T12:34:56.789Z')
    await seedCopyrightDsaPermanentFailureAttemptAt(submissionId, occurredAt)

    await expect(readCopyrightDsaRetentionClock(restriction.noticeId)).resolves.toEqual({
      dsa_activity_at: occurredAt,
      projected_clock: occurredAt,
    })
    await expect(readTestDsaSubmission(submissionId)).resolves.toMatchObject({
      submitted_at: null,
    })
  })
})
