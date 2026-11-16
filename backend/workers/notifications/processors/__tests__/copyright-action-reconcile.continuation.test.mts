import { createCopyrightActionSweepReview } from '@voucha/test-helpers/copyright-action-sweep-fixtures'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { rejectNextPostgresTransactionForTest } from '@voucha/test-helpers/injected-failures'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { removeQueuedJobsById } from '@voucha/test-helpers/shared-queue-cleanup'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { background } from '@queues/background/queues'
import type { CopyrightActionReconcileData } from '@queues/notifications/types'
import { searchRecoverableCopyrightFormReviewIntakeIds } from '@services/copyright-notices'
import { copyrightSweepConfig } from '@services/copyright-notices/work-limits'
import { describe, expect, it, onTestFinished } from 'vitest'
import { copyrightActionReconcileProcessors as stages } from '../copyright-action-reconcile.mts'

const FORMS_JOB = 'notifications.processReconcileCopyrightFormReviews'

async function readFormContinuations(after: string | null) {
  return (await readAllQueueJobs(background)).filter(
    job => job.name === FORMS_JOB && (job.data as CopyrightActionReconcileData).after === after,
  )
}

describe('copyright action reconcile stage continuation', () => {
  it('continues its own stage at the configured cap even when a head item fails', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
        forms_batch_size: 1,
        forms_max_batches_per_run: 1,
      }),
    )
    const first = await createCopyrightActionSweepReview(false)
    const second = await createCopyrightActionSweepReview(false)
    const neighbor = await createCopyrightActionSweepReview(false)
    const ids = [first.id, second.id]
    const page = await searchRecoverableCopyrightFormReviewIntakeIds({ ids, limit: 1 })
    expect(page.results).toEqual([first.id])
    expect(page.page_info.has_next_page).toBe(true)
    onTestFinished(async () => {
      const continuations = await readFormContinuations(page.page_info.end_cursor)
      await removeQueuedJobsById(
        background,
        continuations.map(job => job.id),
      )
    })
    const failure = new Error('head review transaction failed')
    onTestFinished(rejectNextPostgresTransactionForTest(failure))
    const evaluatedAt = '2030-01-02T03:04:05.000Z'

    const result = await stages.forms({ evaluatedAt }, ids).catch((err: unknown) => err)

    expect(result).toBeInstanceOf(AggregateError)
    expect((result as AggregateError).errors).toEqual([failure])
    expect((await readFormContinuations(page.page_info.end_cursor)).map(job => job.data)).toEqual([
      { evaluatedAt, after: page.page_info.end_cursor },
    ])
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

  it('resumes from its saved cursor and leaves the other stages to their own jobs', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
        forms_batch_size: 1,
        forms_max_batches_per_run: 1,
      }),
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
      const continuations = await readFormContinuations(page.page_info.end_cursor)
      await removeQueuedJobsById(
        background,
        continuations.map(job => job.id),
      )
    })
    const evaluatedAt = new Date().toISOString()
    await expect(stages.forms({ evaluatedAt }, ids)).resolves.toEqual({
      enqueued: 0,
      hasMore: true,
    })
    const continuation = (await readFormContinuations(page.page_info.end_cursor))[0]
      ?.data as CopyrightActionReconcileData
    expect(continuation).toEqual({ evaluatedAt, after: page.page_info.end_cursor })
    await expect(stages.forms(continuation, ids)).resolves.toEqual({
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
      (await getCopyrightNoticePrivateAggregate(decision.copyright_notice_id))?.assessments,
    ).toEqual([])
    expect(
      (await getCopyrightNoticePrivateAggregate(neighbor.copyright_notice_id))?.assessments,
    ).toEqual([])
  })
})
