import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import type { RefundableCharge } from '@/types/api-responses'
import { MembershipRefundForm } from '../membership-refund-form'

const { mockCreateMembershipRefund, mockToastSuccess, mockToastWarning, mockToastError } =
  vi.hoisted(() => ({
    mockCreateMembershipRefund: vi.fn<VitestLooseMock>(),
    mockToastSuccess: vi.fn<VitestLooseMock>(),
    mockToastWarning: vi.fn<VitestLooseMock>(),
    mockToastError: vi.fn<VitestLooseMock>(),
  }))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: mockToastSuccess,
        warning: mockToastWarning,
        error: mockToastError,
      },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/api/client/memberships'), async importOriginal => ({
  ...(await importOriginal()),
  createMembershipRefund: mockCreateMembershipRefund,
}))

const charge: RefundableCharge = {
  charge_id: 'ch_reconciliation',
  payment_intent_id: null,
  invoice_id: 'in_reconciliation',
  amount: { amount: 2000, currency: 'usd' },
  amount_refunded: { amount: 0, currency: 'usd' },
  created_at: '2026-01-15T00:00:00.000Z',
  description: 'Annual plan',
}

const replacementCharge: RefundableCharge = {
  charge_id: 'ch_replacement',
  payment_intent_id: null,
  invoice_id: 'in_replacement',
  amount: { amount: 3000, currency: 'usd' },
  amount_refunded: { amount: 0, currency: 'usd' },
  created_at: '2026-09-10T12:01:00.000Z',
  description: 'Replacement membership',
}

const nav = createNavMock()
const onReload = vi.fn<VitestLooseMock>()

function renderRefundForm(charges: RefundableCharge[] = [charge]) {
  return render(
    <MembershipRefundForm
      actorUserId='admin-1'
      userId='user-1'
      charges={charges}
      onReload={onReload}
    />,
  )
}

describe('MembershipRefundForm reconciliation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'))
    vi.clearAllMocks()
    mockCreateMembershipRefund.mockReset()
    nav.reset()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('locks and persists the exact request when the refund is still reconciling', async () => {
    mockCreateMembershipRefund.mockResolvedValue({
      outcome: 'reconciling',
      retry_after_seconds: 300,
    })
    const { container } = renderRefundForm()

    fireEvent.submit(container.querySelector('form')!)
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockToastWarning).toHaveBeenCalledWith(
      'Refund reconciliation is continuing automatically.',
    )
    expect(screen.getByRole('button', { name: 'Reconciling Refund' })).toBeDisabled()
    expect(screen.getByPlaceholderText(/For example, 5\.00/)).toBeDisabled()
    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(onReload).not.toHaveBeenCalled()
    expect(nav.refresh).not.toHaveBeenCalled()

    const stored = JSON.parse(
      sessionStorage.getItem('voucha:membership-refund-attempt:v2:admin-1:user-1')!,
    )
    expect(stored.request).toEqual(
      expect.objectContaining({ user_id: 'user-1', charge_id: 'ch_reconciliation' }),
    )
    expect(stored.reconciliationRetryAt).toBe(Date.parse('2026-09-10T12:05:00.000Z'))
  })

  it('automatically replays the persisted request at its original deadline after reload', async () => {
    mockCreateMembershipRefund
      .mockResolvedValueOnce({ outcome: 'reconciling', retry_after_seconds: 300 })
      .mockResolvedValueOnce({
        outcome: 'completed',
        refund: { id: 'refund-operation-id' },
        cancellation_status: 'not_requested',
      })
    const firstRender = renderRefundForm()
    fireEvent.submit(firstRender.container.querySelector('form')!)
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockCreateMembershipRefund).toHaveBeenCalledOnce()
    const originalRequest = mockCreateMembershipRefund.mock.calls[0]![0]
    const stored = JSON.parse(
      sessionStorage.getItem('voucha:membership-refund-attempt:v2:admin-1:user-1')!,
    ) as { reconciliationRetryAt: number }

    firstRender.unmount()
    await act(() => vi.advanceTimersByTimeAsync(120_000))
    renderRefundForm()
    await act(() => vi.advanceTimersByTimeAsync(stored.reconciliationRetryAt - Date.now() - 1))
    expect(mockCreateMembershipRefund).toHaveBeenCalledOnce()

    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(2)
    expect(mockCreateMembershipRefund.mock.calls[1]![0]).toEqual(originalRequest)
    expect(mockToastSuccess).toHaveBeenCalledWith('Goodwill refund issued')
    expect(sessionStorage).toHaveLength(0)
    expect(onReload).toHaveBeenCalledOnce()
    expect(nav.refresh).toHaveBeenCalledOnce()
  })

  it('keeps a stored reconciliation locked and replays it after the original charge is replaced', async () => {
    mockCreateMembershipRefund
      .mockResolvedValueOnce({ outcome: 'reconciling', retry_after_seconds: 300 })
      .mockResolvedValueOnce({
        outcome: 'completed',
        refund: { id: 'refund-operation-id' },
        cancellation_status: 'not_requested',
      })
    const firstRender = renderRefundForm()
    fireEvent.submit(firstRender.container.querySelector('form')!)
    await act(async () => {
      await Promise.resolve()
    })
    const originalRequest = mockCreateMembershipRefund.mock.calls[0]![0]
    const stored = JSON.parse(
      sessionStorage.getItem('voucha:membership-refund-attempt:v2:admin-1:user-1')!,
    ) as { reconciliationRetryAt: number }

    firstRender.unmount()
    renderRefundForm([replacementCharge])

    expect(screen.getByRole('button', { name: 'Reconciling Refund' })).toBeDisabled()
    expect(screen.getByPlaceholderText(/For example, 5\.00/)).toBeDisabled()
    await act(() => vi.advanceTimersByTimeAsync(stored.reconciliationRetryAt - Date.now()))

    expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(2)
    expect(mockCreateMembershipRefund.mock.calls[1]![0]).toEqual(originalRequest)
  })

  it('tombstones the persisted request when terminal auto-retry cleanup cannot remove it', async () => {
    mockCreateMembershipRefund
      .mockResolvedValueOnce({ outcome: 'reconciling', retry_after_seconds: 1 })
      .mockResolvedValueOnce({
        outcome: 'completed',
        refund: { id: 'refund-operation-id' },
        cancellation_status: 'completed',
      })
    const firstRender = renderRefundForm()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.submit(firstRender.container.querySelector('form')!)
    await act(async () => {
      await Promise.resolve()
    })

    const storagePrototype = Object.getPrototypeOf(sessionStorage) as Storage
    const removeItem = vi.spyOn(storagePrototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'QuotaExceededError')
    })
    await act(() => vi.advanceTimersByTimeAsync(1000))

    expect(mockToastSuccess).toHaveBeenCalledWith('Refund issued and access revoked')
    expect(removeItem).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('voucha:membership-refund-attempt:v2:admin-1:user-1')).toBe(
      'null',
    )

    firstRender.unmount()
    renderRefundForm()
    expect(screen.getByRole('button', { name: 'Issue Refund' })).toBeEnabled()
  })

  it('keeps one automatic retry scheduled after a transient replay failure', async () => {
    mockCreateMembershipRefund
      .mockResolvedValueOnce({ outcome: 'reconciling', retry_after_seconds: 1 })
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce({
        outcome: 'completed',
        refund: { id: 'refund-operation-id' },
        cancellation_status: 'not_requested',
      })
    const { container } = renderRefundForm()
    fireEvent.submit(container.querySelector('form')!)
    await act(async () => {
      await Promise.resolve()
    })

    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(2)
    expect(mockToastError).toHaveBeenCalledWith('Network unavailable')
    expect(screen.getByRole('button', { name: 'Reconciling Refund' })).toBeDisabled()

    await act(() => vi.advanceTimersByTimeAsync(299_999))
    expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(2)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(3)
    expect(mockToastSuccess).toHaveBeenCalledWith('Goodwill refund issued')
  })
})
