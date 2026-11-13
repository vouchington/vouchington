import {
  readDecisionRecoveryState,
  expectedDecisionRecoveryState,
  assertDecisionRecoveryClocks,
} from '@voucha/test-helpers/copyright-decision-recovery-fixtures'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from '@voucha/test-helpers/copyright-assessment-race-outcomes'
import {
  createCopyrightActionSweepReview,
  createCopyrightActionSweepEnforcement,
  createCopyrightActionSweepRestricted,
  removeCopyrightActionSweepJob,
  rejectCopyrightActionDecisionRecoveryForTest,
} from '@voucha/test-helpers/copyright-action-sweep-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { notifications } from '@queues/notifications/queues'
import {
  rejectPostgresWriteForTest,
  rejectNextPostgresTransactionForTest,
  rejectNextBackgroundJobAddBulkForTest,
} from '@voucha/test-helpers/injected-failures'
import { describe, expect, it, onTestFinished } from 'vitest'
import { processReconcileCopyrightActionIntents } from './copyright-action-reconcile.mts'

describe('processReconcileCopyrightActionIntents errors', () => {
  it('continues later stages after a page read failure and reports the failure', async () => {
    const rejected = await createCopyrightActionSweepReview(false)
    const accepted = await createCopyrightActionSweepReview(true)
    const neighbor = await createCopyrightActionSweepReview(true)
    const failure = new Error('form review page failed')
    onTestFinished(
      rejectPostgresWriteForTest('searchRecoverableCopyrightFormReviewIntakeIds', failure),
    )
    const noticeIds = [
      rejected.copyright_notice_id,
      accepted.copyright_notice_id,
      neighbor.copyright_notice_id,
    ]
    const before = await readDecisionRecoveryState(noticeIds)
    const evaluatedAt = new Date().toISOString()
    const result = await processReconcileCopyrightActionIntents(
      { evaluatedAt },
      [rejected.id, accepted.copyright_notice_submission_id],
      1,
    ).catch((err: unknown) => err)
    expect(result).toBeInstanceOf(AggregateError)
    const aggregate = result as AggregateError
    expect(aggregate.errors[0]).toBe(failure)
    const jobs = await readAllQueueJobs(notifications)
    const continuations = jobs
      .filter(
        job =>
          job.name === 'notifications.processReconcileCopyrightActionIntents' &&
          (job.data as { evaluatedAt?: string }).evaluatedAt === evaluatedAt,
      )
      .map(job => job.data)
    const after = await readDecisionRecoveryState(noticeIds)
    const recovered = expectedDecisionRecoveryState(
      before,
      after,
      [accepted.copyright_notice_submission_id],
      accepted.reviewedById,
    )
    const native = nativeCopyrightSerializationConflict
    const errors = aggregate.errors.map((error: unknown) =>
      error === failure ? error : copyrightRaceResult({ status: 'rejected', reason: error }),
    )
    const cause =
      aggregate.cause === undefined
        ? undefined
        : copyrightRaceResult({ status: 'rejected', reason: aggregate.cause })
    // The decision transaction either commits completely or rolls back. Later empty stages may
    // also abort, but no aborted run may enqueue its forms continuation or lose the page fault.
    expect([
      {
        errors: [failure],
        cause: undefined,
        causeIsLastError: false,
        state: recovered,
        continuations: [{ evaluatedAt, pending: ['forms'], cursors: { forms: null } }],
      },
      {
        errors: [failure, native],
        cause: native,
        causeIsLastError: true,
        state: before,
        continuations: [],
      },
      {
        errors: [failure, native],
        cause: native,
        causeIsLastError: true,
        state: recovered,
        continuations: [],
      },
    ]).toContainEqual({
      errors,
      cause,
      causeIsLastError: aggregate.cause === aggregate.errors.at(-1),
      state: after,
      continuations,
    })
    assertDecisionRecoveryClocks(before, after)
    expect(
      (await getCopyrightNoticePrivateAggregate(neighbor.copyright_notice_id))?.assessments,
    ).toEqual([])
  })

  it('preserves a page fault when native serialization stops the next stage', async () => {
    const rejected = await createCopyrightActionSweepReview(false)
    const accepted = await createCopyrightActionSweepReview(true)
    const neighbor = await createCopyrightActionSweepReview(true)
    const noticeIds = [
      rejected.copyright_notice_id,
      accepted.copyright_notice_id,
      neighbor.copyright_notice_id,
    ]
    const before = await readDecisionRecoveryState(noticeIds)
    const failure = new Error('form review page failed before serialization')
    onTestFinished(
      rejectPostgresWriteForTest('searchRecoverableCopyrightFormReviewIntakeIds', failure),
    )
    onTestFinished(rejectCopyrightActionDecisionRecoveryForTest())
    const evaluatedAt = new Date().toISOString()
    const result = await processReconcileCopyrightActionIntents(
      { evaluatedAt },
      [rejected.id, accepted.copyright_notice_submission_id],
      1,
    ).catch((err: unknown) => err)

    expect(result).toBeInstanceOf(AggregateError)
    const aggregate = result as AggregateError
    expect(aggregate.errors[0]).toBe(failure)
    expect(aggregate.cause).toBeInstanceOf(Error)
    expect(aggregate.cause).toMatchObject({
      code: '40001',
      message: 'owned copyright decision recovery serialization fault',
    })
    expect(aggregate.errors).toEqual([failure, aggregate.cause])
    expect(aggregate.errors[1]).toBe(aggregate.cause)
    expect(await readDecisionRecoveryState(noticeIds)).toEqual(before)
    expect(
      (await readAllQueueJobs(notifications)).filter(
        job =>
          job.name === 'notifications.processReconcileCopyrightActionIntents' &&
          (job.data as { evaluatedAt?: string }).evaluatedAt === evaluatedAt,
      ),
    ).toEqual([])
  })

  it('continues to a sibling after an item transaction fails', async () => {
    const first = await createCopyrightActionSweepReview(false)
    const second = await createCopyrightActionSweepReview(false)
    const neighbor = await createCopyrightActionSweepReview(false)
    const failure = new Error('review transaction failed')
    onTestFinished(rejectNextPostgresTransactionForTest(failure))
    const result = await processReconcileCopyrightActionIntents(
      { pending: ['forms'] },
      [first.id, second.id],
      2,
    ).catch((err: unknown) => err)
    expect(result).toBeInstanceOf(AggregateError)
    expect((result as AggregateError).errors).toEqual([failure])
    expect(
      (await getCopyrightNoticePrivateAggregate(first.copyright_notice_id))?.assessments,
    ).toEqual([])
    expect(
      (await getCopyrightNoticePrivateAggregate(second.copyright_notice_id))?.assessments,
    ).toHaveLength(1)
    expect(
      (await getCopyrightNoticePrivateAggregate(neighbor.copyright_notice_id))?.assessments,
    ).toEqual([])
  })

  it('collects page, stage and bulk admission failures while later owned work succeeds', async () => {
    const decision = await createCopyrightActionSweepReview(true)
    const enforcement = await createCopyrightActionSweepEnforcement()
    const action = await createCopyrightActionSweepRestricted()
    const neighbor = await createCopyrightActionSweepEnforcement()
    await removeCopyrightActionSweepJob(action.intent.id)
    const pageFailure = new Error('review page failed')
    const decisionFailure = new Error('decision transaction failed')
    const enqueueFailure = new Error('bulk admission failed')
    onTestFinished(
      rejectPostgresWriteForTest('searchRecoverableCopyrightFormReviewIntakeIds', pageFailure),
    )
    onTestFinished(rejectNextPostgresTransactionForTest(decisionFailure))
    onTestFinished(
      rejectNextBackgroundJobAddBulkForTest(
        'notifications.processApplyCopyrightAction',
        enqueueFailure,
      ),
    )

    const result = await processReconcileCopyrightActionIntents(
      { pending: ['forms', 'decisions', 'actions', 'enforcement'] },
      [decision.copyright_notice_submission_id, enforcement.assessment.id, action.intent.id],
      1,
    ).catch((err: unknown) => err)
    expect(result).toBeInstanceOf(AggregateError)
    expect((result as AggregateError).errors).toEqual([
      pageFailure,
      decisionFailure,
      enqueueFailure,
    ])
    expect(
      (await getCopyrightNoticePrivateAggregate(decision.copyright_notice_id))?.assessments,
    ).toEqual([])
    expect(
      (await getCopyrightNoticePrivateAggregate(enforcement.notice.id))?.restrictions,
    ).toHaveLength(1)
    expect((await getCopyrightNoticePrivateAggregate(neighbor.notice.id))?.restrictions).toEqual([])
    const jobs = await readAllQueueJobs(notifications)
    expect(
      jobs.filter(
        job =>
          job.name === 'notifications.processApplyCopyrightAction' &&
          (job.data as { intentId?: string }).intentId === action.intent.id,
      ),
    ).toEqual([])
  })
})
