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
  enforcementRequests?: CopyrightSweepIdPage[]
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
    createMissingEnforcementRequests: vi.fn<Deps['createMissingEnforcementRequests']>(async () => {
      log.push('create missing enforcement requests')
    }),
    searchEnforcementRequests: vi.fn<Deps['searchEnforcementRequests']>(
      sweep(log, 'enforcement requests', pages.enforcementRequests),
    ),
    processEnforcementRequest: vi.fn<Deps['processEnforcementRequest']>(async id => {
      log.push(`process enforcement request ${id}`)
      return 'completed'
    }),
    searchDueRestorations: vi.fn<Deps['searchDueRestorations']>(
      sweep(log, 'due restorations', pages.dueRestorations),
    ),
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
      enforcementRequests: [page(['request-1'], 'request-cursor'), page(['request-2'], null)],
      dueRestorations: [page(['deadline-1'], 'deadline-cursor'), page(['deadline-2'], null)],
      actionIntents: [page(['intent-1', 'intent-2'], 'intent-cursor'), page(['intent-3'], null)],
    })

    await expect(processReconcileCopyrightActionIntents(deps)).resolves.toEqual({ enqueued: 3 })

    expect(log).toEqual([
      'search form reviews',
      'recover form review review-1',
      'search form reviews',
      'recover form review review-2',
      'create missing enforcement requests',
      'search enforcement requests',
      'process enforcement request request-1',
      'search enforcement requests',
      'process enforcement request request-2',
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
    expect(deps.searchEnforcementRequests.mock.calls).toEqual([[{}], [{ after: 'request-cursor' }]])
    expect(deps.searchDueRestorations.mock.calls).toEqual([
      [{ now: NOW }],
      [{ now: NOW, after: 'deadline-cursor' }],
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

  it('keeps reconciling past failed items and stages, then fails with every error', async () => {
    const { deps } = reconcileDeps({
      formReviews: [page(['failing-review', 'same-page-review'], null)],
      enforcementRequests: [page(['request'], null)],
      actionIntents: [page(['failing-intent', 'same-page-intent'], null)],
    })
    const reviewFailure = new Error('form review recovery failed')
    const backfillFailure = new Error('enforcement backfill failed')
    const dueSearchFailure = new Error('due restoration search failed')
    const enqueueFailure = new Error('enqueue failed')
    deps.recoverFormReview.mockRejectedValueOnce(reviewFailure)
    deps.createMissingEnforcementRequests.mockRejectedValueOnce(backfillFailure)
    deps.searchDueRestorations.mockRejectedValueOnce(dueSearchFailure)
    deps.enqueueApplyCopyrightAction.mockRejectedValueOnce(enqueueFailure)

    const failure = await processReconcileCopyrightActionIntents(deps).then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([
      reviewFailure,
      backfillFailure,
      dueSearchFailure,
      enqueueFailure,
    ])
    expect(deps.recoverFormReview).toHaveBeenCalledWith('same-page-review')
    expect(deps.processEnforcementRequest).toHaveBeenCalledWith('request')
    expect(deps.enqueueApplyCopyrightAction).toHaveBeenCalledWith('same-page-intent')
  })
})
