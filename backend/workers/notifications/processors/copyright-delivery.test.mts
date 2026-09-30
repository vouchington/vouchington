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

function reconcileDeps(sweeps: {
  inApp?: CopyrightSweepIdPage[]
  email?: CopyrightSweepIdPage[]
  responses?: CopyrightSweepIdPage[]
}) {
  const inApp = pages(...(sweeps.inApp ?? []))
  const email = pages(...(sweeps.email ?? []))
  return {
    searchDeliveryIntents: vi.fn<Deps['searchDeliveryIntents']>(async options =>
      options.channel === 'in_app' ? inApp() : email(),
    ),
    searchEmailIntakeResponses: vi.fn<Deps['searchEmailIntakeResponses']>(
      pages(...(sweeps.responses ?? [])),
    ),
    enqueueDeliverCopyrightNotice: vi
      .fn<Deps['enqueueDeliverCopyrightNotice']>()
      .mockResolvedValue(undefined),
    enqueueSendCopyrightNoticeEmail: vi
      .fn<Deps['enqueueSendCopyrightNoticeEmail']>()
      .mockResolvedValue(undefined),
    enqueueSendCopyrightEmailIntakeResponse: vi
      .fn<Deps['enqueueSendCopyrightEmailIntakeResponse']>()
      .mockResolvedValue(undefined),
  }
}

describe('processReconcileCopyrightDeliveryIntents', () => {
  it('walks every page of each sweep and routes each row to its delivery job', async () => {
    const deps = reconcileDeps({
      inApp: [page(['in-app-1', 'in-app-2'], 'in-app-cursor'), page(['in-app-3'], null)],
      email: [page(['email-1'], 'email-cursor'), page(['email-2'], null)],
      responses: [page(['response-1'], 'response-cursor'), page(['response-2'], null)],
    })

    await expect(processReconcileCopyrightDeliveryIntents(deps)).resolves.toEqual({ enqueued: 7 })

    expect(deps.searchDeliveryIntents.mock.calls).toEqual(
      expect.arrayContaining([
        [{ channel: 'in_app' }],
        [{ channel: 'in_app', after: 'in-app-cursor' }],
        [{ channel: 'email' }],
        [{ channel: 'email', after: 'email-cursor' }],
      ]),
    )
    expect(deps.searchDeliveryIntents).toHaveBeenCalledTimes(4)
    expect(deps.searchEmailIntakeResponses.mock.calls).toEqual([
      [{}],
      [{ after: 'response-cursor' }],
    ])
    expect(deps.enqueueDeliverCopyrightNotice.mock.calls).toEqual([
      ['in-app-1'],
      ['in-app-2'],
      ['in-app-3'],
    ])
    expect(deps.enqueueSendCopyrightNoticeEmail.mock.calls).toEqual([['email-1'], ['email-2']])
    expect(deps.enqueueSendCopyrightEmailIntakeResponse.mock.calls).toEqual([
      ['response-1'],
      ['response-2'],
    ])
  })

  it('keeps enqueueing past a failed page read and enqueue, then fails with both errors', async () => {
    const deps = reconcileDeps({ responses: [page(['response'], null)] })
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
      (error: unknown) => error,
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
    expect(deps.enqueueSendCopyrightEmailIntakeResponse).toHaveBeenCalledWith('response')
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
