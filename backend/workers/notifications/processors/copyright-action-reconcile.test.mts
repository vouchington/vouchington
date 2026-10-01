import { describe, expect, it, vi } from 'vitest'
import type { CopyrightSweepIdPage } from '@services/copyright-notices'
import {
  processReconcileCopyrightActionIntents,
  type ReconcileCopyrightActionIntentsDeps as Deps,
} from './copyright-action-reconcile.mts'

const NOW = new Date('2026-07-01T12:00:00.000Z')

function page(results: string[], endCursor: string | null): CopyrightSweepIdPage {
  return {
    results,
    page_info: { has_next_page: endCursor !== null, start_cursor: null, end_cursor: endCursor },
  }
}

type SweepPages = {
  formReviews?: CopyrightSweepIdPage[]
  pendingEnforcement?: CopyrightSweepIdPage[]
  blockedHoldRestorations?: CopyrightSweepIdPage[]
  dueRestorations?: CopyrightSweepIdPage[]
  actionIntents?: CopyrightSweepIdPage[]
}

function sweep(log: string[], name: string, pages: CopyrightSweepIdPage[] = []) {
  const remaining = [...pages]
  return async () => {
    log.push(`search ${name}`)
    return remaining.shift() ?? page([], null)
  }
}

function reconcileDeps(pages: SweepPages = {}) {
  const log: string[] = []
  const deps = {
    searchFormReviews: vi.fn<Deps['searchFormReviews']>(
      sweep(log, 'form reviews', pages.formReviews),
    ),
    recoverFormReview: vi.fn<Deps['recoverFormReview']>(async id => {
      log.push(`recover form review ${id}`)
    }),
    recoverDecisionAssessments: vi.fn<Deps['recoverDecisionAssessments']>(async () => {
      log.push('recover decision assessments')
    }),
    searchPendingEnforcement: vi.fn<Deps['searchPendingEnforcement']>(
      sweep(log, 'pending enforcement', pages.pendingEnforcement),
    ),
    enforceAssessment: vi.fn<Deps['enforceAssessment']>(async id => {
      log.push(`enforce assessment ${id}`)
    }),
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
    createDueRestoreIntents: vi.fn<Deps['createDueRestoreIntents']>(async id => {
      log.push(`create restore intents ${id}`)
      return 1
    }),
    searchActionIntents: vi.fn<Deps['searchActionIntents']>(
      sweep(log, 'action intents', pages.actionIntents),
    ),
    enqueueApplyCopyrightAction: vi.fn<Deps['enqueueApplyCopyrightAction']>(async id => {
      log.push(`enqueue ${id}`)
    }),
    now: () => NOW,
  }
  return { deps, log }
}

describe('processReconcileCopyrightActionIntents', () => {
  it('walks every page of each sweep in stage order', async () => {
    const { deps, log } = reconcileDeps({
      formReviews: [page(['review-1'], 'review-cursor'), page(['review-2'], null)],
      pendingEnforcement: [
        page(['assessment-1'], 'assessment-cursor'),
        page(['assessment-2'], null),
      ],
      blockedHoldRestorations: [page(['notice-1'], 'notice-cursor'), page(['notice-2'], null)],
      dueRestorations: [page(['deadline-1'], 'deadline-cursor'), page(['deadline-2'], null)],
      actionIntents: [page(['intent-1', 'intent-2'], 'intent-cursor'), page(['intent-3'], null)],
    })

    await expect(processReconcileCopyrightActionIntents(deps)).resolves.toEqual({ enqueued: 3 })

    expect(log).toEqual([
      'search form reviews',
      'recover form review review-1',
      'search form reviews',
      'recover form review review-2',
      'recover decision assessments',
      'search pending enforcement',
      'enforce assessment assessment-1',
      'search pending enforcement',
      'enforce assessment assessment-2',
      'search blocked hold restorations',
      'recover blocked hold restorations notice-1',
      'search blocked hold restorations',
      'recover blocked hold restorations notice-2',
      'search due restorations',
      'create restore intents deadline-1',
      'search due restorations',
      'create restore intents deadline-2',
      'search action intents',
      'enqueue intent-1',
      'enqueue intent-2',
      'search action intents',
      'enqueue intent-3',
    ])
    expect(deps.searchFormReviews.mock.calls).toEqual([[{}], [{ after: 'review-cursor' }]])
    expect(deps.searchPendingEnforcement.mock.calls).toEqual([
      [{}],
      [{ after: 'assessment-cursor' }],
    ])
    expect(deps.searchDueRestorations.mock.calls).toEqual([
      [{ now: NOW }],
      [{ now: NOW, after: 'deadline-cursor' }],
    ])
    expect(deps.searchBlockedHoldRestorations.mock.calls).toEqual([
      [{}],
      [{ after: 'notice-cursor' }],
    ])
    expect(deps.recoverBlockedHoldRestorations.mock.calls).toEqual([
      ['notice-1', NOW],
      ['notice-2', NOW],
    ])
    expect(deps.createDueRestoreIntents.mock.calls).toEqual([
      ['deadline-1', NOW],
      ['deadline-2', NOW],
    ])
    expect(deps.searchActionIntents.mock.calls).toEqual([
      [{ now: NOW }],
      [{ now: NOW, after: 'intent-cursor' }],
    ])
  })

  it('waits for blocked hold recovery before creating and enqueueing restores', async () => {
    const { deps } = reconcileDeps({
      blockedHoldRestorations: [page(['notice'], null)],
      dueRestorations: [page(['deadline'], null)],
      actionIntents: [page(['intent'], null)],
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
      expect(deps.enqueueApplyCopyrightAction).not.toHaveBeenCalled()
    } finally {
      released.resolve(1)
      await reconciliation
    }
    expect(deps.createDueRestoreIntents).toHaveBeenCalledWith('deadline', NOW)
    expect(deps.enqueueApplyCopyrightAction).toHaveBeenCalledWith('intent')
  })

  it('keeps reconciling past failed items and stages, then fails with every error', async () => {
    const { deps } = reconcileDeps({
      formReviews: [page(['failing-review', 'same-page-review'], null)],
      pendingEnforcement: [page(['assessment'], null)],
      blockedHoldRestorations: [page(['failing-notice', 'same-page-notice'], null)],
      actionIntents: [page(['failing-intent', 'same-page-intent'], null)],
    })
    const reviewFailure = new Error('form review recovery failed')
    const recoveryFailure = new Error('decision recovery failed')
    const dueSearchFailure = new Error('due restoration search failed')
    const holdFailure = new Error('blocked hold restoration recovery failed')
    const enqueueFailure = new Error('enqueue failed')
    deps.recoverFormReview.mockRejectedValueOnce(reviewFailure)
    deps.recoverDecisionAssessments.mockRejectedValueOnce(recoveryFailure)
    deps.searchDueRestorations.mockRejectedValueOnce(dueSearchFailure)
    deps.recoverBlockedHoldRestorations.mockRejectedValueOnce(holdFailure)
    deps.enqueueApplyCopyrightAction.mockRejectedValueOnce(enqueueFailure)

    const failure = await processReconcileCopyrightActionIntents(deps).then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([
      reviewFailure,
      recoveryFailure,
      holdFailure,
      dueSearchFailure,
      enqueueFailure,
    ])
    expect(deps.recoverFormReview).toHaveBeenCalledWith('same-page-review')
    expect(deps.enforceAssessment).toHaveBeenCalledWith('assessment')
    expect(deps.recoverBlockedHoldRestorations).toHaveBeenCalledWith('same-page-notice', NOW)
    expect(deps.enqueueApplyCopyrightAction).toHaveBeenCalledWith('same-page-intent')
  })
})
