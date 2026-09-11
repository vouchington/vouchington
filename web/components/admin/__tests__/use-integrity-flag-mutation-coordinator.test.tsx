import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useIntegrityFlagMutationCoordinator } from '../use-integrity-flag-mutation-coordinator'
import { IntegrityFlagMutationController } from '../integrity-flag-mutation-controller'

interface TestFlag {
  pending: boolean
}

function renderCoordinator(options: {
  canRetryPenaltyAfterReconciliation?: (
    flag: TestFlag,
    flagId: string,
  ) => boolean | Promise<boolean>
  getFlag: () => Promise<{ flag: TestFlag }>
}) {
  const applyConfirmedFlag = vi.fn<(flag: TestFlag) => void>()
  const rendered = renderHook(() =>
    useIntegrityFlagMutationCoordinator({
      applyConfirmedFlag,
      canRetryPenaltyAfterReconciliation: options.canRetryPenaltyAfterReconciliation,
      getFlag: options.getFlag,
      uncertainMessage: 'Result uncertain',
    }),
  )
  return { ...rendered, applyConfirmedFlag }
}

function beginNonRepeatablePenalty(result: ReturnType<typeof renderCoordinator>['result']) {
  act(() => {
    expect(result.current.acquire('flag-1', 'penalty')).toBe(true)
    result.current.preventPenaltyRetry('flag-1')
  })
}

describe('useIntegrityFlagMutationCoordinator penalty reconciliation', () => {
  it('keeps an ambiguous nonrepeatable penalty locked until its exact read succeeds', async () => {
    const controller = new IntegrityFlagMutationController<TestFlag>({
      applyConfirmedFlag: () => {},
      getFlag: async () => {
        throw new Error('GET unavailable')
      },
      uncertainMessage: 'Result uncertain',
    })

    expect(controller.acquire('flag-1', 'penalty')).toBe(true)
    controller.preventPenaltyRetry('flag-1')
    await expect(controller.reconcile('flag-1', 'penalty')).resolves.toBe(false)

    expect(controller.state).toMatchObject({
      actionErrors: { 'flag-1': 'Result uncertain' },
      actionLoading: { 'flag-1': true },
      reconciliationRequired: { 'flag-1': true },
    })
    expect(controller.acquire('flag-1', 'penalty')).toBe(false)
  })

  it('applies only the state returned by the authoritative exact read', async () => {
    const exactFlag = { pending: false }
    const getFlag = vi
      .fn<() => Promise<{ flag: TestFlag }>>()
      .mockResolvedValue({ flag: exactFlag })
    const { applyConfirmedFlag, result } = renderCoordinator({ getFlag })

    await act(async () => {
      expect(await result.current.reconcile('flag-1', 'resolve')).toBe(true)
    })

    expect(getFlag).toHaveBeenCalledWith('flag-1')
    expect(applyConfirmedFlag).toHaveBeenCalledWith(exactFlag)
  })

  it('allows an opted-in retry after exact reconciliation proves the flag is pending', async () => {
    const { result } = renderCoordinator({
      canRetryPenaltyAfterReconciliation: flag => flag.pending,
      getFlag: vi
        .fn<() => Promise<{ flag: TestFlag }>>()
        .mockResolvedValue({ flag: { pending: true } }),
    })
    beginNonRepeatablePenalty(result)

    await act(async () => {
      expect(await result.current.reconcile('flag-1', 'penalty')).toBe(true)
    })

    act(() => expect(result.current.acquire('flag-1', 'penalty')).toBe(true))
  })

  it('keeps penalty retries blocked by default after successful reconciliation', async () => {
    const { result } = renderCoordinator({
      getFlag: vi
        .fn<() => Promise<{ flag: TestFlag }>>()
        .mockResolvedValue({ flag: { pending: true } }),
    })
    beginNonRepeatablePenalty(result)

    await act(async () => {
      expect(await result.current.reconcile('flag-1', 'penalty')).toBe(true)
    })

    act(() => expect(result.current.acquire('flag-1', 'penalty')).toBe(false))
  })

  it('keeps penalty retries blocked when exact reconciliation fails', async () => {
    const { result } = renderCoordinator({
      canRetryPenaltyAfterReconciliation: flag => flag.pending,
      getFlag: vi
        .fn<() => Promise<{ flag: TestFlag }>>()
        .mockRejectedValue(new Error('GET unavailable')),
    })
    beginNonRepeatablePenalty(result)

    await act(async () => {
      expect(await result.current.reconcile('flag-1', 'penalty')).toBe(false)
    })

    act(() => expect(result.current.acquire('flag-1', 'penalty')).toBe(false))
  })

  it('keeps a penalty locked when its retry-eligibility confirmation read fails', async () => {
    const confirmationRead = vi
      .fn<(flag: TestFlag, flagId: string) => Promise<boolean>>()
      .mockRejectedValue(new Error('confirmation unavailable'))
    const { applyConfirmedFlag, result } = renderCoordinator({
      canRetryPenaltyAfterReconciliation: confirmationRead,
      getFlag: vi
        .fn<() => Promise<{ flag: TestFlag }>>()
        .mockResolvedValue({ flag: { pending: true } }),
    })
    beginNonRepeatablePenalty(result)

    await act(async () => {
      await expect(result.current.reconcile('flag-1', 'penalty')).resolves.toBe(false)
    })

    expect(applyConfirmedFlag).toHaveBeenCalledWith({ pending: true })
    expect(confirmationRead).toHaveBeenCalledWith({ pending: true }, 'flag-1')
    expect(result.current).toMatchObject({
      actionErrors: { 'flag-1': 'Result uncertain' },
      actionLoading: { 'flag-1': true },
      reconciliationRequired: { 'flag-1': true },
    })
    act(() => expect(result.current.acquire('flag-1', 'penalty')).toBe(false))
  })

  it('shares a concurrent reconciliation failure so it cannot be overwritten by a stale success', async () => {
    let rejectExactRead!: (reason?: unknown) => void
    const getFlag = vi.fn<() => Promise<{ flag: TestFlag }>>().mockImplementation(
      () =>
        new Promise((_, reject: (reason?: unknown) => void) => {
          rejectExactRead = reject
        }),
    )
    const { result } = renderCoordinator({ getFlag })
    beginNonRepeatablePenalty(result)

    await act(async () => {
      const first = result.current.reconcile('flag-1', 'penalty')
      const second = result.current.reconcile('flag-1', 'penalty')
      expect(getFlag).toHaveBeenCalledOnce()

      rejectExactRead(new Error('GET unavailable'))
      await expect(Promise.all([first, second])).resolves.toEqual([false, false])
    })

    expect(result.current).toMatchObject({
      actionErrors: { 'flag-1': 'Result uncertain' },
      actionLoading: { 'flag-1': true },
      reconciliationRequired: { 'flag-1': true },
    })
    act(() => expect(result.current.acquire('flag-1', 'penalty')).toBe(false))
  })

  it('returns the active reconciliation promise to concurrent controller callers', async () => {
    let resolveExactRead!: (state: { flag: TestFlag }) => void
    const controller = new IntegrityFlagMutationController<TestFlag>({
      applyConfirmedFlag: () => {},
      getFlag: () =>
        new Promise(resolve => {
          resolveExactRead = resolve
        }),
      uncertainMessage: 'Result uncertain',
    })

    const first = controller.reconcile('flag-1', 'resolve')
    const second = controller.reconcile('flag-1', 'resolve')

    expect(second).toBe(first)
    resolveExactRead({ flag: { pending: true } })
    await expect(first).resolves.toBe(true)
  })

  it('clears a rejected reconciliation promise before a later retry', async () => {
    const applyConfirmedFlag = vi.fn<(flag: TestFlag) => void>().mockImplementationOnce(() => {
      throw new Error('apply failed')
    })
    const getFlag = vi
      .fn<() => Promise<{ flag: TestFlag }>>()
      .mockResolvedValue({ flag: { pending: true } })
    const controller = new IntegrityFlagMutationController<TestFlag>({
      applyConfirmedFlag,
      getFlag,
      uncertainMessage: 'Result uncertain',
    })

    await expect(controller.reconcile('flag-1', 'resolve')).rejects.toThrow('apply failed')
    await expect(controller.reconcile('flag-1', 'resolve')).resolves.toBe(true)

    expect(getFlag).toHaveBeenCalledTimes(2)
  })

  it('never evaluates retry eligibility when a known-success penalty only needs confirmation', async () => {
    const canRetry = vi.fn<(flag: TestFlag) => boolean>().mockReturnValue(true)
    const { result } = renderCoordinator({
      canRetryPenaltyAfterReconciliation: canRetry,
      getFlag: vi
        .fn<() => Promise<{ flag: TestFlag }>>()
        .mockResolvedValue({ flag: { pending: true } }),
    })
    beginNonRepeatablePenalty(result)
    act(() => result.current.requireReconciliation('flag-1', 'penalty-confirmation'))

    await act(async () => result.current.retryReconciliation('flag-1'))

    expect(canRetry).not.toHaveBeenCalled()
    act(() => expect(result.current.acquire('flag-1', 'penalty')).toBe(false))
  })
})
