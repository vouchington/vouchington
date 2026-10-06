import assert from 'http-assert'
import createHttpError from 'http-errors'
import { describe, expect, it, vi } from 'vitest'
import Sentry from '@modules/on-error/sentry'
import { createTestUser } from '@voucha/test-helpers'
import { getExternalFetch } from '@modules/utils/http-dispatchers'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import {
  readTestDsaSubmissionForRestriction,
  removeTestCopyrightTargetImageRow,
  restoreTestCopyrightTargetImageRow,
  setTestImageUploadCompletedAt,
} from '@voucha/test-helpers/dsa-statement-build-failure-fixtures'
import {
  countTestDsaSubmissionsForRestriction,
  readTestDsaAttempts,
} from '@voucha/test-helpers/dsa-statement-submission-fixtures'
import {
  DSA_TEST_UUID,
  dsaTestResponse,
} from '@voucha/test-helpers/dsa-transparency-database-fixtures'
import { claimDsaStatementSubmission } from './dsa-statement-submission-claims.mts'
import {
  getDsaStatementBuildFailureCode,
  recordDsaStatementBuildFailure,
  reportDsaStatementBuildFailure,
} from './dsa-statement-submission-build-failure.mts'
import { replayDsaStatementSubmission } from './dsa-statement-submission-replay.mts'
import {
  materializeDsaStatementSubmissions,
  searchRecoverableDsaStatementSubmissionIds,
  type DsaStatementSweepDependencies,
} from './dsa-statement-submission-sweep.mts'
import { processDsaStatementSubmission } from './dsa-statement-submission.mts'

async function newRestriction() {
  return createTestCopyrightRestrictionForImage(await createTestCopyrightImageFixture('post-image'))
}

describe('DSA statement payload build failures', () => {
  it('records a restriction whose payload cannot be built and keeps materializing the rest', async () => {
    const from = new Date('2026-07-01T00:00:00.000Z')
    const first = await newRestriction()
    const broken = await newRestriction()
    const last = await newRestriction()
    const foreign = await newRestriction()
    const ownedIds = [first.restrictionId, broken.restrictionId, last.restrictionId]
    await removeTestCopyrightTargetImageRow(broken.targetId)
    const report = vi.fn<DsaStatementSweepDependencies['reportBuildFailure']>()

    await expect(
      materializeDsaStatementSubmissions(from, {
        reportBuildFailure: report,
        restrictionIds: ownedIds,
      }),
    ).resolves.toBe(2)
    expect(report).toHaveBeenCalledExactlyOnceWith({
      restrictionId: broken.restrictionId,
      failureCode: 'http_404',
    })
    const failed = await readTestDsaSubmissionForRestriction(broken.restrictionId)
    expect(failed).toMatchObject({ payload: null, failure_code: 'http_404', submitted_at: null })
    expect(failed.failed_at).toBeInstanceOf(Date)
    for (const sent of [first, last]) {
      const submission = await readTestDsaSubmissionForRestriction(sent.restrictionId)
      expect(submission).toMatchObject({ payload: { puid: sent.restrictionId }, failed_at: null })
    }

    // The next run neither retries the failed restriction nor warns again.
    await expect(
      materializeDsaStatementSubmissions(from, {
        reportBuildFailure: report,
        restrictionIds: ownedIds,
      }),
    ).resolves.toBe(0)
    expect(report).toHaveBeenCalledOnce()
    await expect(
      recordDsaStatementBuildFailure(broken.restrictionId, from, 'http_404'),
    ).resolves.toBe(false)
    expect(await countTestDsaSubmissionsForRestriction(foreign.restrictionId)).toBe(0)

    // A failed row is never enqueued or claimed for sending, even though it is otherwise due.
    const sentIds = (
      await Promise.all(
        [first, last].map(sent => readTestDsaSubmissionForRestriction(sent.restrictionId)),
      )
    ).map(submission => submission.id)
    const due = await searchRecoverableDsaStatementSubmissionIds({
      from,
      limit: 100,
      ids: [...sentIds, failed.id],
    })
    expect(due.results.toSorted()).toEqual([...sentIds].toSorted())
    expect(due.results).not.toContain(failed.id)
    await expect(claimDsaStatementSubmission(failed.id, from)).resolves.toEqual({
      kind: 'not_claimable',
    })

    // Anything but a builder HttpError, such as a database outage, still fails the run loudly.
    const late = await newRestriction()
    const outage = new Error('database unavailable')
    await expect(
      materializeDsaStatementSubmissions(from, {
        buildPayload: vi
          .fn<DsaStatementSweepDependencies['buildPayload']>()
          .mockRejectedValue(outage),
        reportBuildFailure: report,
        restrictionIds: [late.restrictionId],
      }),
    ).rejects.toBe(outage)
    expect(await countTestDsaSubmissionsForRestriction(late.restrictionId)).toBe(0)
    expect(await countTestDsaSubmissionsForRestriction(foreign.restrictionId)).toBe(0)
    expect(report).toHaveBeenCalledOnce()
    await expect(
      materializeDsaStatementSubmissions(from, {
        reportBuildFailure: report,
        restrictionIds: [late.restrictionId],
      }),
    ).resolves.toBe(1)
  })

  it('records a restriction whose built payload fails the closed contract as a 422 and keeps going', async () => {
    const from = new Date('2026-07-01T00:00:00.000Z')
    const invalidImage = await createTestCopyrightImageFixture('post-image')
    const invalid = await createTestCopyrightRestrictionForImage(invalidImage)
    const valid = await newRestriction()
    const foreign = await newRestriction()
    // The builder's own validation throws a 422 HttpError, so it is a data problem the sweep records.
    await setTestImageUploadCompletedAt(invalidImage.imageId, new Date('1999-12-31T00:00:00.000Z'))
    const report = vi.fn<DsaStatementSweepDependencies['reportBuildFailure']>()

    const ownedIds = [invalid.restrictionId, valid.restrictionId]
    await expect(
      materializeDsaStatementSubmissions(from, {
        reportBuildFailure: report,
        restrictionIds: ownedIds,
      }),
    ).resolves.toBe(1)
    expect(report).toHaveBeenCalledExactlyOnceWith({
      restrictionId: invalid.restrictionId,
      failureCode: 'http_422',
    })
    expect(await readTestDsaSubmissionForRestriction(invalid.restrictionId)).toMatchObject({
      payload: null,
      failure_code: 'http_422',
    })
    expect(await readTestDsaSubmissionForRestriction(valid.restrictionId)).toMatchObject({
      payload: { puid: valid.restrictionId },
      failed_at: null,
    })
    await expect(
      materializeDsaStatementSubmissions(from, {
        reportBuildFailure: report,
        restrictionIds: ownedIds,
      }),
    ).resolves.toBe(0)
    expect(await countTestDsaSubmissionsForRestriction(foreign.restrictionId)).toBe(0)
    expect(report).toHaveBeenCalledOnce()
  })

  it('replays a failed restriction only after its data is fixed, then submits the rebuilt payload', async () => {
    const from = new Date('2026-07-01T00:00:00.000Z')
    const broken = await newRestriction()
    const foreign = await newRestriction()
    const removedImageRow = await removeTestCopyrightTargetImageRow(broken.targetId)
    await expect(
      materializeDsaStatementSubmissions(from, {
        reportBuildFailure: vi.fn<DsaStatementSweepDependencies['reportBuildFailure']>(),
        restrictionIds: [broken.restrictionId],
      }),
    ).resolves.toBe(0)
    expect(await countTestDsaSubmissionsForRestriction(foreign.restrictionId)).toBe(0)
    const failed = await readTestDsaSubmissionForRestriction(broken.restrictionId)
    const administrator = await createTestUser({ extraRoles: ['administrator'] })

    // The data is still broken: nothing changes and no attempt is appended.
    await expect(replayDsaStatementSubmission(administrator.id, failed.id)).resolves.toBe(false)
    expect(await readTestDsaSubmissionForRestriction(broken.restrictionId)).toMatchObject({
      payload: null,
      failure_code: 'http_404',
    })
    expect(await readTestDsaAttempts(failed.id)).toEqual([])

    await restoreTestCopyrightTargetImageRow(removedImageRow)
    await expect(replayDsaStatementSubmission(administrator.id, failed.id)).resolves.toBe(true)
    expect(await readTestDsaSubmissionForRestriction(broken.restrictionId)).toMatchObject({
      payload: { puid: broken.restrictionId },
      failed_at: null,
      failure_code: null,
    })
    expect(await readTestDsaAttempts(failed.id)).toEqual([
      {
        attempt_number: 1,
        outcome: 'replayed',
        error_code: null,
        replayed_by_id: administrator.id,
      },
    ])

    const requestFetch = vi.fn<ReturnType<typeof getExternalFetch>>(async () =>
      dsaTestResponse(201, { uuid: DSA_TEST_UUID }),
    ) as unknown as ReturnType<typeof getExternalFetch>
    await expect(
      processDsaStatementSubmission(failed.id, {
        isEnabled: async () => true,
        getFrom: async () => from,
        url: () => 'https://transparency.dsa.ec.europa.eu/api/v1',
        token: () => 'synthetic-token',
        requestFetch,
      }),
    ).resolves.toEqual({ status: 'submitted', recorded: true })
    expect(
      (await readTestDsaSubmissionForRestriction(broken.restrictionId)).submitted_at,
    ).toBeInstanceOf(Date)
  })
})

describe('payload build failure classification', () => {
  it('classifies the payload builder asserts by their status only', () => {
    const thrownBy = (operation: () => void): unknown => {
      try {
        operation()
      } catch (err) {
        return err
      }
      throw new Error('Expected the operation to throw')
    }

    expect(
      getDsaStatementBuildFailureCode(thrownBy(() => assert(false, 404, 'Restriction not found'))),
    ).toBe('http_404')
    expect(
      getDsaStatementBuildFailureCode(thrownBy(() => assert(false, 422, 'No upload date'))),
    ).toBe('http_422')
    expect(getDsaStatementBuildFailureCode(createHttpError(500, 'Unsupported'))).toBe('http_500')
  })

  it('leaves database and programming errors for the sweep to rethrow', () => {
    const databaseError = Object.assign(new Error('canceling statement due to timeout'), {
      code: '57014',
    })

    expect(getDsaStatementBuildFailureCode(databaseError)).toBeNull()
    expect(getDsaStatementBuildFailureCode(new TypeError('x is undefined'))).toBeNull()
    expect(getDsaStatementBuildFailureCode(new Error('Unexpected builder failure'))).toBeNull()
    expect(getDsaStatementBuildFailureCode('http_404')).toBeNull()
    expect(getDsaStatementBuildFailureCode(undefined)).toBeNull()
  })

  it('warns once with the restriction id and code, never a message or payload', () => {
    const captureMessage = vi.spyOn(Sentry, 'captureMessage').mockReturnValue('')
    const restrictionId = '0199a000-0000-7000-8000-000000000001'

    reportDsaStatementBuildFailure({
      restrictionId,
      failureCode: 'http_404',
      payload: { puid: 'ignored' },
      message: 'ignored',
    } as Parameters<typeof reportDsaStatementBuildFailure>[0])

    expect(captureMessage).toHaveBeenCalledExactlyOnceWith(
      'copyright_dsa_statement_payload_build_failed',
      {
        level: 'warning',
        tags: {
          reason: 'copyright_dsa_statement_payload_build_failed',
          restrictionId,
          failureCode: 'http_404',
        },
      },
    )
    captureMessage.mockRestore()
  })
})
