import { createCopyrightActionSweepReview } from '@voucha/test-helpers/copyright-action-sweep-fixtures'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { rejectNextPostgresTransactionForTest } from '@voucha/test-helpers/injected-failures'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { removeQueuedJobsById } from '@voucha/test-helpers/shared-queue-cleanup'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { notifications } from '@queues/notifications/queues'
import type { CopyrightSweepContinuation } from '@queues/notifications/types'
import { searchRecoverableCopyrightFormReviewIntakeIds } from '@services/copyright-notices'
import { copyrightSweepConfig } from '@services/copyright-notices/work-limits'
import { describe, expect, it, onTestFinished } from 'vitest'
import { processReconcileCopyrightActionIntents } from '../copyright-action-reconcile.mts'

describe('processReconcileCopyrightActionIntents continuation', () => {
  it('continues only unfinished stages at the configured cap even when a head item fails', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(copyrightSweepConfig, { max_batches_per_run: 1 }),
    )
    const first = await createCopyrightActionSweepReview(false)
    const second = await createCopyrightActionSweepReview(false)
    const neighbor = await createCopyrightActionSweepReview(false)
    const ids = [first.id, second.id]
    const page = await searchRecoverableCopyrightFormReviewIntakeIds({ ids, limit: 1 })
    expect(page.results).toEqual([first.id])
    expect(page.page_info.has_next_page).toBe(true)
    onTestFinished(async () => {
      const continuations = (await readAllQueueJobs(notifications)).filter(
        job =>
          job.name === 'notifications.processReconcileCopyrightActionIntents' &&
          (job.data as CopyrightSweepContinuation).cursors?.forms === page.page_info.end_cursor,
      )
      await removeQueuedJobsById(
        notifications,
        continuations.map(job => job.id),
      )
    })
    const failure = new Error('head review transaction failed')
    onTestFinished(rejectNextPostgresTransactionForTest(failure))
    const evaluatedAt = '2030-01-02T03:04:05.000Z'

    const result = await processReconcileCopyrightActionIntents({ evaluatedAt }, ids, 1).catch(
      (err: unknown) => err,
    )

    expect(result).toBeInstanceOf(AggregateError)
    expect((result as AggregateError).errors).toEqual([failure])
    const jobs = await readAllQueueJobs(notifications)
    expect(
      jobs.find(
        job =>
          job.name === 'notifications.processReconcileCopyrightActionIntents' &&
          (job.data as CopyrightSweepContinuation).cursors?.forms === page.page_info.end_cursor,
      )?.data,
    ).toEqual({
      evaluatedAt,
      pending: [
        'decisions',
        'enforcement',
        'suspended',
        'blocked',
        'restorations',
        'actions',
        'forms',
      ],
      cursors: { forms: page.page_info.end_cursor },
    })
    expect(
      (await getCopyrightNoticePrivateAggregate(first.copyright_notice_id))?.assessments,
    ).toEqual([])
    expect(
      (await getCopyrightNoticePrivateAggregate(second.copyright_notice_id))?.assessments,
    ).toEqual([])
    expect(
      (await getCopyrightNoticePrivateAggregate(neighbor.copyright_notice_id))?.assessments,
    ).toEqual([])
  })

  it('rotates unfinished stages under the shared page budget', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(copyrightSweepConfig, { max_batches_per_run: 1 }),
    )
    const first = await createCopyrightActionSweepReview(false)
    const second = await createCopyrightActionSweepReview(false)
    const decision = await createCopyrightActionSweepReview(true)
    const neighbor = await createCopyrightActionSweepReview(false)
    const ids = [first.id, second.id, decision.copyright_notice_submission_id]
    const page = await searchRecoverableCopyrightFormReviewIntakeIds({ ids, limit: 1 })
    expect(page.results).toEqual([first.id])
    expect(page.page_info.has_next_page).toBe(true)
    onTestFinished(async () => {
      const continuations = (await readAllQueueJobs(notifications)).filter(
        job =>
          job.name === 'notifications.processReconcileCopyrightActionIntents' &&
          (job.data as CopyrightSweepContinuation).cursors?.forms === page.page_info.end_cursor,
      )
      await removeQueuedJobsById(
        notifications,
        continuations.map(job => job.id),
      )
    })
    const evaluatedAt = new Date().toISOString()
    await expect(processReconcileCopyrightActionIntents({ evaluatedAt }, ids, 1)).resolves.toEqual({
      enqueued: 0,
      hasMore: true,
    })
    const jobs = await readAllQueueJobs(notifications)
    const continuation = jobs.find(
      job =>
        job.name === 'notifications.processReconcileCopyrightActionIntents' &&
        (job.data as CopyrightSweepContinuation).cursors?.forms === page.page_info.end_cursor,
    )?.data as CopyrightSweepContinuation
    expect(continuation).toEqual({
      evaluatedAt,
      pending: [
        'decisions',
        'enforcement',
        'suspended',
        'blocked',
        'restorations',
        'actions',
        'forms',
      ],
      cursors: { forms: page.page_info.end_cursor },
    })
    await expect(processReconcileCopyrightActionIntents(continuation, ids, 1)).resolves.toEqual({
      enqueued: 0,
      hasMore: true,
    })
    expect(
      (await getCopyrightNoticePrivateAggregate(first.copyright_notice_id))?.assessments,
    ).toHaveLength(1)
    expect(
      (await getCopyrightNoticePrivateAggregate(second.copyright_notice_id))?.assessments,
    ).toEqual([])
    expect(
      (await getCopyrightNoticePrivateAggregate(decision.copyright_notice_id))?.assessments,
    ).toHaveLength(1)
    expect(
      (await getCopyrightNoticePrivateAggregate(neighbor.copyright_notice_id))?.assessments,
    ).toEqual([])
    const nextJobs = await readAllQueueJobs(notifications)
    expect(
      nextJobs.some(
        job =>
          job.name === 'notifications.processReconcileCopyrightActionIntents' &&
          JSON.stringify(job.data) ===
            JSON.stringify({
              evaluatedAt,
              pending: ['enforcement', 'suspended', 'blocked', 'restorations', 'actions', 'forms'],
              cursors: { forms: page.page_info.end_cursor },
            }),
      ),
    ).toBe(true)
  })
})
