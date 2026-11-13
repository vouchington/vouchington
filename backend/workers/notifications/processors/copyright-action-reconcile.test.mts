import { createCommittedSuspendedSweepCase } from '@voucha/test-helpers/copyright-suspended-sweep-prerequisite'
import {
  createCopyrightActionSweepReview,
  createCopyrightActionSweepEnforcement,
  createCopyrightActionSweepDeadline,
  createCopyrightActionSweepBlocked,
  createCopyrightActionSweepRestricted,
  removeCopyrightActionSweepJob,
} from '@voucha/test-helpers/copyright-action-sweep-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { notifications } from '@queues/notifications/queues'
import { searchRecoverableCopyrightFormReviewIntakeIds } from '@services/copyright-notices'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { processReconcileCopyrightActionIntents } from './copyright-action-reconcile.mts'

describe('processReconcileCopyrightActionIntents', () => {
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

    await expect(processReconcileCopyrightActionIntents({}, ids, 1)).resolves.toEqual({
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

  it('enforces only the selected assessment', async () => {
    const owned = await createCopyrightActionSweepEnforcement()
    const neighbor = await createCopyrightActionSweepEnforcement()
    await expect(
      processReconcileCopyrightActionIntents(
        { pending: ['enforcement'] },
        [owned.assessment.id],
        1,
      ),
    ).resolves.toEqual({ enqueued: 0, hasMore: false })
    expect((await getCopyrightNoticePrivateAggregate(owned.notice.id))?.restrictions).toHaveLength(
      1,
    )
    expect((await getCopyrightNoticePrivateAggregate(neighbor.notice.id))?.restrictions).toEqual([])
  })

  it('lifts only the selected suspended claimant restriction', async () => {
    const owned = await createCommittedSuspendedSweepCase()
    const neighbor = await createCommittedSuspendedSweepCase()
    await expect(
      processReconcileCopyrightActionIntents(
        { evaluatedAt: '2030-01-02T03:04:05.000Z', pending: ['suspended'] },
        [owned],
        1,
      ),
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
    await expect(
      processReconcileCopyrightActionIntents(
        { evaluatedAt, pending: ['restorations'] },
        [owned.deadline.id],
        1,
      ),
    ).resolves.toEqual({ enqueued: 0, hasMore: false })
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
    await expect(
      processReconcileCopyrightActionIntents({ pending: ['actions'] }, [owned.intent.id], 1),
    ).resolves.toEqual({ enqueued: 1, hasMore: false })
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
      processReconcileCopyrightActionIntents(
        { evaluatedAt, pending: ['blocked', 'actions'] },
        [owned.notice.id, owned.restore.id],
        1,
      ),
    ).resolves.toEqual({ enqueued: 1, hasMore: false })
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

  it('rejects an unknown continuation stage', async () => {
    await expect(
      processReconcileCopyrightActionIntents({ pending: ['unknown' as never] }, [], 1),
    ).rejects.toThrow('Unknown copyright sweep stage: unknown')
  })
})
