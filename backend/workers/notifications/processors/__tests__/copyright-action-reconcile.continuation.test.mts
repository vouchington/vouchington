import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { notifications } from '@queues/notifications/queues'
import { copyrightSweepConfig } from '@services/copyright-notices/work-limits'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { processReconcileCopyrightActionIntents } from '../copyright-action-reconcile.mts'

type Deps = Required<NonNullable<Parameters<typeof processReconcileCopyrightActionIntents>[0]>>
type DuePage = Awaited<ReturnType<Deps['searchDueRestorations']>>

const NOW = new Date('2026-07-01T12:00:00.000Z')
const RUN = crypto.randomUUID()

function page(results: string[], endCursor: string | null): DuePage {
  return {
    results,
    page_info: { has_next_page: endCursor !== null, start_cursor: null, end_cursor: endCursor },
    candidates: {},
  }
}

function reconcileDeps(pages: { forms?: DuePage; decisions?: DuePage } = {}) {
  const empty = async () => page([], null)
  return {
    searchFormReviews: vi.fn<Deps['searchFormReviews']>(async () => pages.forms ?? page([], null)),
    recoverFormReview: vi.fn<Deps['recoverFormReview']>(async () => undefined),
    recoverDecisionAssessments: vi.fn<Deps['recoverDecisionAssessments']>(
      async () => pages.decisions ?? page([], null),
    ),
    searchPendingEnforcement: vi.fn<Deps['searchPendingEnforcement']>(empty),
    enforceAssessment: vi.fn<Deps['enforceAssessment']>(async () => undefined),
    searchSuspendedClaimantRestrictions: vi.fn<Deps['searchSuspendedClaimantRestrictions']>(empty),
    liftSuspendedClaimantRestrictions: vi.fn<Deps['liftSuspendedClaimantRestrictions']>(
      async () => undefined,
    ),
    searchBlockedHoldRestorations: vi.fn<Deps['searchBlockedHoldRestorations']>(empty),
    recoverBlockedHoldRestorations: vi.fn<Deps['recoverBlockedHoldRestorations']>(async () => 0),
    searchDueRestorations: vi.fn<Deps['searchDueRestorations']>(empty),
    createDueRestoreIntents: vi.fn<Deps['createDueRestoreIntents']>(async () => 0),
    searchActionIntents: vi.fn<Deps['searchActionIntents']>(empty),
  }
}

describe('processReconcileCopyrightActionIntents continuation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('continues only unfinished stages at the configured cap even when a head item fails', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
        batch_size: 1,
        max_batches_per_run: 1,
      }),
    )
    const headCursor = `head-cursor-${RUN}`
    const decisionCursor = `decision-cursor-${RUN}`
    const continuations: unknown[] = []
    const realAdd = notifications.add
    vi.spyOn(notifications, 'add').mockImplementation((name, ...args) => {
      if (name === 'notifications.processReconcileCopyrightActionIntents')
        continuations.push(args[0])
      return realAdd.call(notifications, name, ...args)
    })
    const deps = reconcileDeps({ forms: page(['head'], headCursor) })
    deps.recoverFormReview.mockRejectedValueOnce(new Error('head failed'))

    await expect(processReconcileCopyrightActionIntents(deps)).rejects.toBeInstanceOf(
      AggregateError,
    )

    expect(continuations).toEqual([
      {
        evaluatedAt: NOW.toISOString(),
        pending: [
          'decisions',
          'enforcement',
          'suspended',
          'blocked',
          'restorations',
          'actions',
          'forms',
        ],
        cursors: { forms: headCursor },
      },
    ])
    const round = reconcileDeps({ decisions: page(['decision-tail'], decisionCursor) })
    await processReconcileCopyrightActionIntents(round, continuations[0] as never)
    expect(round.searchFormReviews).not.toHaveBeenCalled()
    expect(round.recoverDecisionAssessments).toHaveBeenCalledExactlyOnceWith({ limit: 1 })
    expect(round.searchPendingEnforcement).not.toHaveBeenCalled()
    expect(continuations[1]).toEqual({
      evaluatedAt: NOW.toISOString(),
      pending: [
        'enforcement',
        'suspended',
        'blocked',
        'restorations',
        'actions',
        'forms',
        'decisions',
      ],
      cursors: { forms: headCursor, decisions: decisionCursor },
    })
  })
})
