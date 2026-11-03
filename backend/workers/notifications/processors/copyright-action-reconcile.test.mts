import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { notifications } from '@queues/notifications/queues'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CopyrightSweepIdPage } from '@services/copyright-notices'
import { processReconcileCopyrightActionIntents } from './copyright-action-reconcile.mts'

const realAddBulk = notifications.addBulk
type Deps = Required<NonNullable<Parameters<typeof processReconcileCopyrightActionIntents>[0]>>
type DueRestorationPage = Awaited<ReturnType<Deps['searchDueRestorations']>>

const NOW = new Date('2026-07-01T12:00:00.000Z')
function page(results: string[], endCursor: string | null): DueRestorationPage {
  return {
    results,
    page_info: { has_next_page: endCursor !== null, start_cursor: null, end_cursor: endCursor },
    candidates: Object.fromEntries(
      results.map(id => [id, [{ deadline_id: id }]]),
    ) as DueRestorationPage['candidates'],
  }
}

type SweepPages = {
  decisionAssessments?: CopyrightSweepIdPage[]
  formReviews?: CopyrightSweepIdPage[]
  pendingEnforcement?: CopyrightSweepIdPage[]
  suspendedClaimants?: CopyrightSweepIdPage[]
  blockedHoldRestorations?: CopyrightSweepIdPage[]
  dueRestorations?: DueRestorationPage[]
  actionIntents?: CopyrightSweepIdPage[]
}

function sweep<T extends CopyrightSweepIdPage>(log: string[], name: string, pages: T[] = []) {
  const remaining = [...pages]
  return async () => {
    log.push(`search ${name}`)
    return remaining.shift() ?? page([], null)
  }
}

function reconcileDeps(pages: SweepPages = {}) {
  const log: string[] = []
  const decisionPages = [...(pages.decisionAssessments ?? [])]
  const deps = {
    searchFormReviews: vi.fn<Deps['searchFormReviews']>(
      sweep(log, 'form reviews', pages.formReviews),
    ),
    recoverFormReview: vi.fn<Deps['recoverFormReview']>(async id => {
      log.push(`recover form review ${id}`)
    }),
    recoverDecisionAssessments: vi.fn<Deps['recoverDecisionAssessments']>(async () => {
      log.push('recover decision assessments')
      return decisionPages.shift() ?? page([], null)
    }),
    searchPendingEnforcement: vi.fn<Deps['searchPendingEnforcement']>(
      sweep(log, 'pending enforcement', pages.pendingEnforcement),
    ),
    enforceAssessment: vi.fn<Deps['enforceAssessment']>(async id => {
      log.push(`enforce assessment ${id}`)
    }),
    searchSuspendedClaimantRestrictions: vi.fn<Deps['searchSuspendedClaimantRestrictions']>(
      sweep(log, 'suspended claimants', pages.suspendedClaimants),
    ),
    liftSuspendedClaimantRestrictions: vi.fn<Deps['liftSuspendedClaimantRestrictions']>(
      async id => {
        log.push(`lift suspended claimant ${id}`)
      },
    ),
    searchDueRestorations: vi.fn<Deps['searchDueRestorations']>(
      sweep(log, 'due restorations', pages.dueRestorations),
    ),
    searchBlockedHoldRestorations: vi.fn<Deps['searchBlockedHoldRestorations']>(
      sweep(log, 'blocked hold restorations', pages.blockedHoldRestorations),
    ),
    recoverBlockedHoldRestorations: vi.fn<Deps['recoverBlockedHoldRestorations']>(async id => {
      log.push(`recover blocked hold restorations ${id}`)
      return 1
    }),
    createDueRestoreIntents: vi.fn<Deps['createDueRestoreIntents']>(async candidates => {
      log.push(`create restore intents ${candidates[0]?.deadline_id}`)
      return 1
    }),
    searchActionIntents: vi.fn<Deps['searchActionIntents']>(
      sweep(log, 'action intents', pages.actionIntents),
    ),
  }
  const enqueueBulk = vi.spyOn(notifications, 'addBulk').mockImplementation((jobs, ...rest) => {
    for (const job of jobs) log.push(`enqueue ${(job.data as { intentId: string }).intentId}`)
    return realAddBulk.call(notifications, jobs, ...rest)
  })
  return { deps, enqueueBulk, log }
}

function enqueuedIntentIds(enqueueBulk: { mock: { calls: unknown[][] } }): string[][] {
  return enqueueBulk.mock.calls.map(([jobs]) =>
    (jobs as { data: { intentId: string } }[]).map(job => job.data.intentId),
  )
}

const RUN = crypto.randomUUID()
const intent = (name: string) => `${name}-${RUN}`

describe('processReconcileCopyrightActionIntents', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('rotates one page per unfinished stage under the shared job budget', async () => {
    const [intent1, intent2, intent3] = [intent('intent-1'), intent('intent-2'), intent('intent-3')]
    const { deps, log } = reconcileDeps({
      formReviews: [page(['review-1'], 'review-cursor'), page(['review-2'], null)],
      pendingEnforcement: [
        page(['assessment-1'], 'assessment-cursor'),
        page(['assessment-2'], null),
      ],
      suspendedClaimants: [
        page(['claimant-notice-1'], 'claimant-cursor'),
        page(['claimant-notice-2'], null),
      ],
      blockedHoldRestorations: [page(['notice-1'], 'notice-cursor'), page(['notice-2'], null)],
      dueRestorations: [page(['deadline-1'], 'deadline-cursor'), page(['deadline-2'], null)],
      actionIntents: [page([intent1, intent2], 'intent-cursor'), page([intent3], null)],
    })

    await expect(processReconcileCopyrightActionIntents(deps)).resolves.toEqual({
      enqueued: 3,
      hasMore: false,
    })

    expect(log).toEqual([
      'search form reviews',
      'recover form review review-1',
      'recover decision assessments',
      'search pending enforcement',
      'enforce assessment assessment-1',
      'search suspended claimants',
      'lift suspended claimant claimant-notice-1',
      'search blocked hold restorations',
      'recover blocked hold restorations notice-1',
      'search due restorations',
      'create restore intents deadline-1',
      'search action intents',
      `enqueue ${intent1}`,
      `enqueue ${intent2}`,
      'search form reviews',
      'recover form review review-2',
      'search pending enforcement',
      'enforce assessment assessment-2',
      'search suspended claimants',
      'lift suspended claimant claimant-notice-2',
      'search blocked hold restorations',
      'recover blocked hold restorations notice-2',
      'search due restorations',
      'create restore intents deadline-2',
      'search action intents',
      `enqueue ${intent3}`,
    ])
    expect(deps.searchFormReviews.mock.calls).toEqual([
      [{ limit: 100 }],
      [{ limit: 100, after: 'review-cursor' }],
    ])
    expect(deps.searchPendingEnforcement.mock.calls).toEqual([
      [{ limit: 100 }],
      [{ limit: 100, after: 'assessment-cursor' }],
    ])
    expect(deps.searchSuspendedClaimantRestrictions.mock.calls).toEqual([
      [{ limit: 100 }],
      [{ limit: 100, after: 'claimant-cursor' }],
    ])
    expect(deps.liftSuspendedClaimantRestrictions.mock.calls).toEqual([
      ['claimant-notice-1', NOW],
      ['claimant-notice-2', NOW],
    ])
    expect(deps.searchDueRestorations.mock.calls).toEqual([
      [{ now: NOW, limit: 100 }],
      [{ now: NOW, limit: 100, after: 'deadline-cursor' }],
    ])
    expect(deps.searchBlockedHoldRestorations.mock.calls).toEqual([
      [{ limit: 100 }],
      [{ limit: 100, after: 'notice-cursor' }],
    ])
    expect(deps.recoverBlockedHoldRestorations.mock.calls).toEqual([
      ['notice-1', NOW],
      ['notice-2', NOW],
    ])
    expect(deps.createDueRestoreIntents).toHaveBeenCalledTimes(2)
    expect(deps.searchActionIntents.mock.calls).toEqual([
      [{ now: NOW, limit: 100 }],
      [{ now: NOW, limit: 100, after: 'intent-cursor' }],
    ])
    const queued = (await readAllQueueJobs(notifications)).filter(job =>
      [intent1, intent2, intent3].includes((job.data as { intentId?: string }).intentId ?? ''),
    )
    expect(queued.map(job => [job.name, job.data])).toEqual(
      expect.arrayContaining(
        [intent1, intent2, intent3].map(intentId => [
          'notifications.processApplyCopyrightAction',
          { intentId },
        ]),
      ),
    )
    expect(queued).toHaveLength(3)
  })

  it('waits for blocked hold recovery before creating and enqueueing restores', async () => {
    const intentId = intent('intent')
    const { deps, enqueueBulk } = reconcileDeps({
      blockedHoldRestorations: [page(['notice'], null)],
      dueRestorations: [page(['deadline'], null)],
      actionIntents: [page([intentId], null)],
    })
    const entered = Promise.withResolvers<void>()
    const released = Promise.withResolvers<number>()
    deps.recoverBlockedHoldRestorations.mockImplementationOnce(() => {
      entered.resolve()
      return released.promise
    })
    const reconciliation = processReconcileCopyrightActionIntents(deps)
    try {
      await entered.promise
      expect(deps.searchDueRestorations).not.toHaveBeenCalled()
      expect(deps.createDueRestoreIntents).not.toHaveBeenCalled()
      expect(deps.searchActionIntents).not.toHaveBeenCalled()
      expect(enqueueBulk).not.toHaveBeenCalled()
    } finally {
      released.resolve(1)
      await reconciliation
    }
    expect(deps.createDueRestoreIntents).toHaveBeenCalledOnce()
    expect(enqueuedIntentIds(enqueueBulk)).toEqual([[intentId]])
  })

  it('keeps reconciling past failed items and stages, then fails with every error', async () => {
    const failingIntent = intent('failing-intent')
    const samePageIntent = intent('same-page-intent')
    const { deps, enqueueBulk } = reconcileDeps({
      formReviews: [page(['failing-review', 'same-page-review'], null)],
      pendingEnforcement: [page(['assessment'], null)],
      suspendedClaimants: [page(['failing-claimant', 'same-page-claimant'], null)],
      blockedHoldRestorations: [page(['failing-notice', 'same-page-notice'], null)],
      actionIntents: [page([failingIntent, samePageIntent], null)],
    })
    const reviewFailure = new Error('form review recovery failed')
    const recoveryFailure = new Error('decision recovery failed')
    const liftFailure = new Error('suspended claimant lift failed')
    const dueSearchFailure = new Error('due restoration search failed')
    const holdFailure = new Error('blocked hold restoration recovery failed')
    const enqueueFailure = new Error('enqueue failed')
    deps.recoverFormReview.mockRejectedValueOnce(reviewFailure)
    deps.recoverDecisionAssessments.mockRejectedValueOnce(recoveryFailure)
    deps.liftSuspendedClaimantRestrictions.mockRejectedValueOnce(liftFailure)
    deps.searchDueRestorations.mockRejectedValueOnce(dueSearchFailure)
    deps.recoverBlockedHoldRestorations.mockRejectedValueOnce(holdFailure)
    enqueueBulk.mockRejectedValueOnce(enqueueFailure)

    const failure = await processReconcileCopyrightActionIntents(deps).then(
      () => null,
      (err: unknown) => err,
    )

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([
      reviewFailure,
      recoveryFailure,
      liftFailure,
      holdFailure,
      dueSearchFailure,
      enqueueFailure,
    ])
    expect(deps.recoverFormReview).toHaveBeenCalledWith('same-page-review')
    expect(deps.enforceAssessment).toHaveBeenCalledWith('assessment')
    expect(deps.liftSuspendedClaimantRestrictions).toHaveBeenCalledWith('same-page-claimant', NOW)
    expect(deps.recoverBlockedHoldRestorations).toHaveBeenCalledWith('same-page-notice', NOW)
    expect(enqueuedIntentIds(enqueueBulk)).toEqual([[failingIntent, samePageIntent]])
  })
})
