import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { copyrightSweepConfig } from '@services/copyright-notices/work-limits'
import { describe, expect, it, vi } from 'vitest'
import type { CopyrightSweepIdPage } from '@services/copyright-notices'
import {
  processDeliverCopyrightNotice,
  processReconcileCopyrightDeliveryIntents,
  type ReconcileCopyrightDeliveryIntentsDeps as Deps,
} from './copyright-delivery.mts'

function page(results: string[], endCursor: string | null): CopyrightSweepIdPage {
  return {
    results,
    page_info: { has_next_page: endCursor !== null, start_cursor: null, end_cursor: endCursor },
  }
}

function pages(...sequence: CopyrightSweepIdPage[]) {
  const remaining = [...sequence]
  return async () => remaining.shift() ?? page([], null)
}

function reconcileDeps(sweeps: { inApp?: CopyrightSweepIdPage[]; email?: CopyrightSweepIdPage[] }) {
  const inApp = pages(...(sweeps.inApp ?? []))
  const email = pages(...(sweeps.email ?? []))
  return {
    searchDeliveryIntents: vi.fn<Deps['searchDeliveryIntents']>(async options =>
      options.channel === 'in_app' ? inApp() : email(),
    ),
    enqueueDeliverCopyrightNotice: vi
      .fn<Deps['enqueueDeliverCopyrightNotice']>()
      .mockResolvedValue(undefined),
    enqueueSendCopyrightNoticeEmail: vi
      .fn<Deps['enqueueSendCopyrightNoticeEmail']>()
      .mockResolvedValue(undefined),
  }
}

describe('processReconcileCopyrightDeliveryIntents', () => {
  it('walks every page of each sweep and routes each row to its delivery job', async () => {
    const deps = reconcileDeps({
      inApp: [page(['in-app-1', 'in-app-2'], 'in-app-cursor'), page(['in-app-3'], null)],
      email: [page(['email-1'], 'email-cursor'), page(['email-2'], null)],
    })

    await expect(processReconcileCopyrightDeliveryIntents(deps)).resolves.toEqual({
      enqueued: 5,
      hasMore: false,
    })

    expect(deps.searchDeliveryIntents.mock.calls).toEqual(
      expect.arrayContaining([
        [{ limit: 100, channel: 'in_app' }],
        [{ limit: 100, channel: 'in_app', after: 'in-app-cursor' }],
        [{ limit: 100, channel: 'email' }],
        [{ limit: 100, channel: 'email', after: 'email-cursor' }],
      ]),
    )
    expect(deps.searchDeliveryIntents).toHaveBeenCalledTimes(4)
    expect(deps.enqueueDeliverCopyrightNotice.mock.calls).toEqual([
      ['in-app-1'],
      ['in-app-2'],
      ['in-app-3'],
    ])
    expect(deps.enqueueSendCopyrightNoticeEmail.mock.calls).toEqual([['email-1'], ['email-2']])
  })

  it('keeps enqueueing past a failed page read and enqueue, then fails with both errors', async () => {
    const deps = reconcileDeps({})
    const searchFailure = new Error('email intent search failed')
    const enqueueFailure = new Error('enqueue failed')
    const inApp = pages(
      page(['failing-in-app', 'same-page-in-app'], 'in-app-cursor'),
      page(['next'], null),
    )
    deps.searchDeliveryIntents.mockImplementation(async options => {
      if (options.channel === 'email') throw searchFailure
      return inApp()
    })
    deps.enqueueDeliverCopyrightNotice.mockRejectedValueOnce(enqueueFailure)

    const failure = await processReconcileCopyrightDeliveryIntents(deps).then(
      () => null,
      (err: unknown) => err,
    )

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toHaveLength(2)
    expect((failure as AggregateError).errors).toEqual(
      expect.arrayContaining([searchFailure, enqueueFailure]),
    )
    expect(deps.enqueueDeliverCopyrightNotice.mock.calls).toEqual([
      ['failing-in-app'],
      ['same-page-in-app'],
      ['next'],
    ])
  })
  it('reports its cap and resumes only the unfinished channel', async () => {
    overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
      batch_size: 1,
      max_batches_per_run: 1,
    })
    const deps = reconcileDeps({ inApp: [page(['head'], 'head-cursor')] })
    const enqueueContinuation = vi.fn<Deps['enqueueContinuation']>(async () => undefined)
    await expect(
      processReconcileCopyrightDeliveryIntents({ ...deps, enqueueContinuation }),
    ).resolves.toEqual({ enqueued: 1, hasMore: true })
    expect(enqueueContinuation).toHaveBeenCalledWith({ cursors: { in_app: 'head-cursor' } })
    const next = reconcileDeps({ inApp: [page(['tail'], null)] })
    await expect(
      processReconcileCopyrightDeliveryIntents(next, { cursors: { in_app: 'head-cursor' } }),
    ).resolves.toEqual({ enqueued: 1, hasMore: false })
    expect(next.searchDeliveryIntents).toHaveBeenCalledWith({
      channel: 'in_app',
      after: 'head-cursor',
      limit: 1,
    })
    expect(next.enqueueSendCopyrightNoticeEmail).not.toHaveBeenCalled()
  })
})

describe('processDeliverCopyrightNotice', () => {
  it('delivers a claimed in-app copyright notice through the worker processor', async () => {
    const deliver = vi.fn<(intentId: string) => Promise<boolean>>().mockResolvedValue(true)

    await expect(
      processDeliverCopyrightNotice(
        { intentId: '00000000-0000-7000-8000-000000000017' },
        { deliverCopyrightInAppNotification: deliver },
      ),
    ).resolves.toBe(true)
    expect(deliver).toHaveBeenCalledWith('00000000-0000-7000-8000-000000000017')
  })
})
