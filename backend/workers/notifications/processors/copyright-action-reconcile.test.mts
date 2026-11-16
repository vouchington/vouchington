import {
  createCopyrightActionSweepReview,
  createCopyrightActionSweepEnforcement,
  createCopyrightActionSweepDeadline,
  createCopyrightActionSweepSuspended,
  createCopyrightActionSweepBlocked,
  createCopyrightActionSweepRestricted,
  removeCopyrightActionSweepJob,
} from '@voucha/test-helpers/copyright-action-sweep-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { notifications } from '@queues/notifications/queues'
import {
  rejectPostgresWriteForTest,
  rejectNextPostgresTransactionForTest,
  rejectNextBackgroundJobAddBulkForTest,
} from '@voucha/test-helpers/injected-failures'
import { searchRecoverableCopyrightFormReviewIntakeIds } from '@services/copyright-notices'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { copyrightActionReconcileProcessors as stages } from './copyright-action-reconcile.mts'

describe('copyright action reconcile stage jobs', () => {
  it('recovers owned rejected reviews and leaves an eligible neighbor unchanged', async () => {
    const first = await createCopyrightActionSweepReview(false)
    const second = await createCopyrightActionSweepReview(false)
    const neighbor = await createCopyrightActionSweepReview(false)
    const ids = [first.id, second.id]
    const page = await searchRecoverableCopyrightFormReviewIntakeIds({ ids, limit: 1 })
    expect(page.results).toEqual([first.id])
    expect(page.page_info.has_next_page).toBe(true)
    const next = await searchRecoverableCopyrightFormReviewIntakeIds({
      ids,
      limit: 1,
      after: page.page_info.end_cursor!,
    })
    expect(next.results).toEqual([second.id])
    expect(next.page_info.has_next_page).toBe(false)

    await expect(stages.forms({}, ids)).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
    expect(
      (await getCopyrightNoticePrivateAggregate(first.copyright_notice_id))?.assessments,
    ).toHaveLength(1)
    expect(
      (await getCopyrightNoticePrivateAggregate(second.copyright_notice_id))?.assessments,
    ).toHaveLength(1)
    expect(
      (await getCopyrightNoticePrivateAggregate(neighbor.copyright_notice_id))?.assessments,
    ).toEqual([])
    expect(
      (await searchRecoverableCopyrightFormReviewIntakeIds({ ids: [neighbor.id] })).results,
    ).toEqual([neighbor.id])
  })

  it('fails only the forms stage on a page read failure and leaves its sibling stage running', async () => {
    const rejected = await createCopyrightActionSweepReview(false)
    const accepted = await createCopyrightActionSweepReview(true)
    const neighbor = await createCopyrightActionSweepReview(true)
    const failure = new Error('form review page failed')
    onTestFinished(
      rejectPostgresWriteForTest('searchRecoverableCopyrightFormReviewIntakeIds', failure),
    )
    const ids = [rejected.id, accepted.copyright_notice_submission_id]
    await expect(stages.forms({ evaluatedAt: new Date().toISOString() }, ids)).rejects.toBe(failure)
    expect(
      (await readAllQueueJobs(notifications)).filter(
        job => job.name === 'notifications.processReconcileCopyrightFormReviews',
      ),
    ).toEqual([])
    await expect(stages.decisions({}, ids)).resolves.toEqual({ enqueued: 0, hasMore: false })
    expect(
      (await getCopyrightNoticePrivateAggregate(accepted.copyright_notice_id))?.assessments,
    ).toHaveLength(1)
    expect(
      (await getCopyrightNoticePrivateAggregate(neighbor.copyright_notice_id))?.assessments,
    ).toEqual([])
  })
  it('enforces only the selected assessment', async () => {
    const owned = await createCopyrightActionSweepEnforcement()
    const neighbor = await createCopyrightActionSweepEnforcement()
    await expect(stages.enforcement({}, [owned.assessment.id])).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
    expect((await getCopyrightNoticePrivateAggregate(owned.notice.id))?.restrictions).toHaveLength(
      1,
    )
    expect((await getCopyrightNoticePrivateAggregate(neighbor.notice.id))?.restrictions).toEqual([])
  })

  it('lifts only the selected suspended claimant restriction', async () => {
    const owned = await createCopyrightActionSweepSuspended()
    const neighbor = await createCopyrightActionSweepSuspended()
    await expect(
      stages.suspended({ evaluatedAt: '2030-01-02T03:04:05.000Z' }, [owned]),
    ).resolves.toEqual({ enqueued: 0, hasMore: false })
    const restriction = (await getCopyrightNoticePrivateAggregate(owned))?.restrictions[0]
    expect(restriction?.human_review_action).toBe('reverse')
    expect(restriction?.human_reviewed_at).toEqual(new Date('2030-01-02T03:04:05.000Z'))
    expect(
      (await getCopyrightNoticePrivateAggregate(neighbor))?.restrictions[0]?.human_review_action,
    ).toBeNull()
  })

  it('creates a due restoration only for its selected deadline', async () => {
    const owned = await createCopyrightActionSweepDeadline()
    const neighbor = await createCopyrightActionSweepDeadline()
    const evaluatedAt = new Date(
      Math.max(
        owned.deadline.restoration_deadline_at.getTime(),
        neighbor.deadline.restoration_deadline_at.getTime(),
      ) + 1000,
    ).toISOString()
    await expect(stages.restorations({ evaluatedAt }, [owned.deadline.id])).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
    expect(
      (await getCopyrightNoticePrivateAggregate(owned.notice.id))?.actionIntents.filter(
        intent => intent.action === 'restore',
      ),
    ).toHaveLength(1)
    expect(
      (await getCopyrightNoticePrivateAggregate(neighbor.notice.id))?.actionIntents.filter(
        intent => intent.action === 'restore',
      ),
    ).toEqual([])
  })

  it('enqueues selected action intents without enqueuing an eligible neighbor', async () => {
    const owned = await createCopyrightActionSweepRestricted()
    const neighbor = await createCopyrightActionSweepRestricted()
    await removeCopyrightActionSweepJob(owned.intent.id)
    await removeCopyrightActionSweepJob(neighbor.intent.id)
    await expect(stages.actions({}, [owned.intent.id])).resolves.toEqual({
      enqueued: 1,
      hasMore: false,
    })
    const jobs = await readAllQueueJobs(notifications)
    expect(
      jobs.filter(
        job =>
          job.name === 'notifications.processApplyCopyrightAction' &&
          (job.data as { intentId?: string }).intentId === owned.intent.id,
      ),
    ).toHaveLength(1)
    expect(
      jobs.filter(
        job =>
          job.name === 'notifications.processApplyCopyrightAction' &&
          (job.data as { intentId?: string }).intentId === neighbor.intent.id,
      ),
    ).toEqual([])
  })

  it('reopens a resolved hold before enqueueing its restore, leaving an eligible neighbor blocked', async () => {
    installTestMediaDeliveryEdge()
    onTestFinished(() => {
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
    })
    const owned = await createCopyrightActionSweepBlocked()
    const neighbor = await createCopyrightActionSweepBlocked()
    const evaluatedAt = new Date(
      Math.max(owned.restorationAt.getTime(), neighbor.restorationAt.getTime()),
    ).toISOString()
    await expect(
      stages.blocked({ evaluatedAt }, [owned.notice.id, owned.restore.id]),
    ).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
    await expect(stages.actions({ evaluatedAt }, [owned.restore.id])).resolves.toEqual({
      enqueued: 1,
      hasMore: false,
    })
    expect(
      (await getCopyrightNoticePrivateAggregate(owned.notice.id))?.actionIntents.find(
        intent => intent.id === owned.restore.id,
      )?.state,
    ).toBe('pending')
    expect(
      (await getCopyrightNoticePrivateAggregate(neighbor.notice.id))?.actionIntents.find(
        intent => intent.id === neighbor.restore.id,
      )?.state,
    ).toBe('blocked')
    const jobs = await readAllQueueJobs(notifications)
    expect(
      jobs.filter(
        job =>
          job.name === 'notifications.processApplyCopyrightAction' &&
          (job.data as { intentId?: string }).intentId === owned.restore.id,
      ),
    ).toHaveLength(1)
    expect(
      jobs.filter(
        job =>
          job.name === 'notifications.processApplyCopyrightAction' &&
          (job.data as { intentId?: string }).intentId === neighbor.restore.id,
      ),
    ).toEqual([])
  })

  it('continues to a sibling after an item transaction fails', async () => {
    const first = await createCopyrightActionSweepReview(false)
    const second = await createCopyrightActionSweepReview(false)
    const neighbor = await createCopyrightActionSweepReview(false)
    const failure = new Error('review transaction failed')
    onTestFinished(rejectNextPostgresTransactionForTest(failure))
    const result = await stages.forms({}, [first.id, second.id]).catch((err: unknown) => err)
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

  it('fails each stage on its own while its sibling stages still settle owned work', async () => {
    const decision = await createCopyrightActionSweepReview(true)
    const enforcement = await createCopyrightActionSweepEnforcement()
    const action = await createCopyrightActionSweepRestricted()
    const neighbor = await createCopyrightActionSweepEnforcement()
    await removeCopyrightActionSweepJob(action.intent.id)
    const decisionFailure = new Error('decision transaction failed')
    const enqueueFailure = new Error('bulk admission failed')
    onTestFinished(rejectNextPostgresTransactionForTest(decisionFailure))
    onTestFinished(
      rejectNextBackgroundJobAddBulkForTest(
        'notifications.processApplyCopyrightAction',
        enqueueFailure,
      ),
    )

    await expect(stages.decisions({}, [decision.copyright_notice_submission_id])).rejects.toBe(
      decisionFailure,
    )
    const enqueued = await stages.actions({}, [action.intent.id]).catch((err: unknown) => err)
    expect(enqueued).toBeInstanceOf(AggregateError)
    expect((enqueued as AggregateError).errors).toEqual([enqueueFailure])
    await expect(stages.enforcement({}, [enforcement.assessment.id])).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
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
