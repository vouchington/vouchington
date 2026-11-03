import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import Sentry from '@modules/on-error/sentry'
import { createTestUser } from '@voucha/test-helpers'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { readTestDsaSubmissionForRestriction } from '@voucha/test-helpers/dsa-statement-build-failure-fixtures'
import { overrideDsaStatementSubmissionConfigForTest } from '@voucha/test-helpers/dsa-switches'
import { rejectNextPostgresTransactionForTest } from '@voucha/test-helpers/injected-failures'
import { rewritePostgresTransactionRowsForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import {
  countTestDsaSubmissionsForRestriction,
  readTestDsaAttempts,
} from '@voucha/test-helpers/dsa-statement-submission-fixtures'
import {
  DSA_TEST_PROVIDER_ORIGIN,
  stubDsaTransparencyDatabaseProvider,
} from '@voucha/test-helpers/dsa-transparency-database-provider'
import { claimDsaStatementSubmission } from './dsa-statement-submission-claims.mts'
import { recordDsaStatementBuildFailure } from './dsa-statement-submission-build-failure.mts'
import { replayDsaStatementSubmission } from './dsa-statement-submission-replay.mts'
import {
  prepareDsaStatementSubmissionSweep,
  searchRecoverableDsaStatementSubmissionIds,
} from './dsa-statement-submission-sweep.mts'
import { processDsaStatementSubmission } from './dsa-statement-submission.mts'

async function newRestriction() {
  return createTestCopyrightRestrictionForImage(await createTestCopyrightImageFixture('post-image'))
}

/**
 * Makes the real payload builder see this restriction as missing (404) or with an upload date the
 * validator rejects (422). Other restrictions build normally; returns the restore.
 */
function breakPayloadBuild(restrictionId: string, status: 404 | 422): () => void {
  const restore = rewritePostgresTransactionRowsForTest(
    '/* buildCopyrightDsaStatementPayload */',
    values => values.includes(restrictionId),
    rows =>
      status === 404
        ? []
        : rows.map(row => ({ ...row, content_at: new Date('1999-12-31T00:00:00.000Z') })),
  )
  onTestFinished(restore)
  return restore
}

const from = new Date('2026-07-01T00:00:00.000Z')

async function configureSweep(): Promise<void> {
  vi.stubEnv('DSA_TRANSPARENCY_DATABASE_URL', `${DSA_TEST_PROVIDER_ORIGIN}/api/v1`)
  vi.stubEnv('DSA_TRANSPARENCY_DATABASE_TOKEN', 'synthetic-token')
  onTestFinished(
    await overrideDsaStatementSubmissionConfigForTest({ dsaSorDatabaseFrom: '2026-07-01' }),
  )
}

function buildFailureReport(restrictionId: string, failureCode: string) {
  return [
    'copyright_dsa_statement_payload_build_failed',
    {
      level: 'warning',
      tags: {
        reason: 'copyright_dsa_statement_payload_build_failed',
        restrictionId,
        failureCode,
      },
    },
  ] as const
}

describe('DSA statement payload build failures', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('records a restriction whose payload cannot be built and keeps materializing the rest', async () => {
    const first = await newRestriction()
    const broken = await newRestriction()
    const last = await newRestriction()
    const foreign = await newRestriction()
    await configureSweep()
    breakPayloadBuild(broken.restrictionId, 404)
    const ownedIds = [first.restrictionId, broken.restrictionId, last.restrictionId]
    const report = vi.spyOn(Sentry, 'captureMessage').mockReturnValue('')
    const scope = { restrictionIds: ownedIds }
    await expect(prepareDsaStatementSubmissionSweep(scope)).resolves.toEqual({
      from,
      hasMore: false,
    })
    expect(report).toHaveBeenCalledExactlyOnceWith(
      ...buildFailureReport(broken.restrictionId, 'http_404'),
    )
    const failed = await readTestDsaSubmissionForRestriction(broken.restrictionId)
    expect(failed).toMatchObject({ payload: null, failure_code: 'http_404', submitted_at: null })
    expect(failed.failed_at).toBeInstanceOf(Date)
    for (const sent of [first, last]) {
      const submission = await readTestDsaSubmissionForRestriction(sent.restrictionId)
      expect(submission).toMatchObject({ payload: { puid: sent.restrictionId }, failed_at: null })
    }

    // The next run neither retries the failed restriction nor warns again.
    await expect(prepareDsaStatementSubmissionSweep(scope)).resolves.toEqual({
      from,
      hasMore: false,
    })
    expect(await readTestDsaSubmissionForRestriction(broken.restrictionId)).toEqual(failed)
    for (const sent of [first, last]) {
      expect(await countTestDsaSubmissionsForRestriction(sent.restrictionId)).toBe(1)
    }
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
  })

  it('records a restriction whose builder rejects an invalid payload as a 422 and keeps going', async () => {
    const invalid = await newRestriction()
    const valid = await newRestriction()
    const foreign = await newRestriction()
    await configureSweep()
    // The real payload validator throws a 422 HttpError, so the sweep records this build failure.
    breakPayloadBuild(invalid.restrictionId, 422)
    const report = vi.spyOn(Sentry, 'captureMessage').mockReturnValue('')
    const scope = { restrictionIds: [invalid.restrictionId, valid.restrictionId] }
    await expect(prepareDsaStatementSubmissionSweep(scope)).resolves.toEqual({
      from,
      hasMore: false,
    })
    expect(report).toHaveBeenCalledExactlyOnceWith(
      ...buildFailureReport(invalid.restrictionId, 'http_422'),
    )
    expect(await readTestDsaSubmissionForRestriction(invalid.restrictionId)).toMatchObject({
      payload: null,
      failure_code: 'http_422',
    })
    expect(await readTestDsaSubmissionForRestriction(valid.restrictionId)).toMatchObject({
      payload: { puid: valid.restrictionId },
      failed_at: null,
    })
    await expect(prepareDsaStatementSubmissionSweep(scope)).resolves.toEqual({
      from,
      hasMore: false,
    })
    expect(await countTestDsaSubmissionsForRestriction(invalid.restrictionId)).toBe(1)
    expect(await countTestDsaSubmissionsForRestriction(valid.restrictionId)).toBe(1)
    expect(await countTestDsaSubmissionsForRestriction(foreign.restrictionId)).toBe(0)
    expect(report).toHaveBeenCalledOnce()
  })

  it('fails the run loudly on anything but a builder HttpError, then materializes next run', async () => {
    const late = await newRestriction()
    const foreign = await newRestriction()
    await configureSweep()
    const report = vi.spyOn(Sentry, 'captureMessage').mockReturnValue('')
    const outage = new Error('database unavailable')
    const restore = rejectNextPostgresTransactionForTest(outage)
    onTestFinished(restore)
    await expect(
      prepareDsaStatementSubmissionSweep({ restrictionIds: [late.restrictionId] }),
    ).rejects.toBe(outage)
    restore()
    expect(await countTestDsaSubmissionsForRestriction(late.restrictionId)).toBe(0)
    expect(await countTestDsaSubmissionsForRestriction(foreign.restrictionId)).toBe(0)
    expect(report).not.toHaveBeenCalled()
    await expect(
      prepareDsaStatementSubmissionSweep({ restrictionIds: [late.restrictionId] }),
    ).resolves.toEqual({ from, hasMore: false })
    expect(await readTestDsaSubmissionForRestriction(late.restrictionId)).toMatchObject({
      payload: { puid: late.restrictionId },
      failed_at: null,
    })
  })

  it('replays a failed restriction after its builder recovers, then submits the rebuilt payload', async () => {
    const broken = await newRestriction()
    const foreign = await newRestriction()
    await configureSweep()
    const restoreBuilder = breakPayloadBuild(broken.restrictionId, 404)
    await expect(
      prepareDsaStatementSubmissionSweep({ restrictionIds: [broken.restrictionId] }),
    ).resolves.toEqual({ from, hasMore: false })
    expect(await countTestDsaSubmissionsForRestriction(foreign.restrictionId)).toBe(0)
    const failed = await readTestDsaSubmissionForRestriction(broken.restrictionId)
    const administrator = await createTestUser({ extraRoles: ['administrator'] })

    // The builder still fails: nothing changes and no attempt is appended.
    await expect(replayDsaStatementSubmission(administrator.id, failed.id)).resolves.toBe(false)
    expect(await readTestDsaSubmissionForRestriction(broken.restrictionId)).toMatchObject({
      payload: null,
      failure_code: 'http_404',
    })
    expect(await readTestDsaAttempts(failed.id)).toEqual([])

    restoreBuilder()
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

    const provider = stubDsaTransparencyDatabaseProvider()
    await expect(processDsaStatementSubmission(failed.id)).resolves.toEqual({
      status: 'submitted',
      recorded: true,
    })
    expect(provider.requests).toBe(1)
    expect(
      (await readTestDsaSubmissionForRestriction(broken.restrictionId)).submitted_at,
    ).toBeInstanceOf(Date)
  })
})
