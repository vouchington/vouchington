import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RefundableCharge } from '@/types/api-responses'
import { MembershipRefundForm } from '../membership-refund-form'

const {
  mockRefresh,
  mockCreateMembershipRefund,
  mockToastSuccess,
  mockToastWarning,
  mockToastError,
} = vi.hoisted(() => ({
  mockRefresh: vi.fn<VitestLooseMock>(),
  mockCreateMembershipRefund: vi.fn<VitestLooseMock>(),
  mockToastSuccess: vi.fn<VitestLooseMock>(),
  mockToastWarning: vi.fn<VitestLooseMock>(),
  mockToastError: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
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

vi.mock(import('@/lib/api/client/memberships'), () => ({
  fetchRefundableCharges: vi.fn<VitestLooseMock>(),
  createMembershipRefund: mockCreateMembershipRefund,
}))

const fakeCharge: RefundableCharge = {
  charge_id: 'ch_test',
  payment_intent_id: null,
  invoice_id: 'in_test',
  amount: { amount: 2000, currency: 'usd' },
  amount_refunded: { amount: 0, currency: 'usd' },
  created_at: '2026-01-15T00:00:00.000Z',
  description: 'Annual plan',
}

const onReload = vi.fn<VitestLooseMock>()
const storageMethodSpies: Array<{ mockRestore(): void }> = []

function renderRefundForm(charges: RefundableCharge[] = [fakeCharge], actorUserId = 'admin-1') {
  return render(
    <MembershipRefundForm
      actorUserId={actorUserId}
      userId='user-1'
      charges={charges}
      onReload={onReload}
    />,
  )
}

function makeStorageMethodThrow(method: 'setItem' | 'removeItem') {
  const storagePrototype = Object.getPrototypeOf(sessionStorage) as Storage
  const spy = vi.spyOn(storagePrototype, method).mockImplementation(() => {
    throw new DOMException('Storage unavailable', 'QuotaExceededError')
  })
  storageMethodSpies.push(spy)
  return spy
}

describe('MembershipRefundForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockCreateMembershipRefund.mockResolvedValue({
      refund: { id: 're_test' },
      cancellation_status: 'not_requested',
    })
  })

  afterEach(() => {
    for (const spy of storageMethodSpies.splice(0)) spy.mockRestore()
  })

  it('completes a successful refund when session storage persistence fails', async () => {
    const setItem = makeStorageMethodThrow('setItem')
    const { container } = renderRefundForm()

    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Goodwill refund issued'))
    expect(mockCreateMembershipRefund).toHaveBeenCalledOnce()
    expect(setItem).toHaveBeenCalled()
    expect(mockToastSuccess).toHaveBeenCalledWith('Goodwill refund issued')
    expect(mockToastError).not.toHaveBeenCalled()
    expect(onReload).toHaveBeenCalledOnce()
    expect(mockRefresh).toHaveBeenCalledOnce()
  })

  it('preserves pending cancellation in memory when session storage persistence fails', async () => {
    makeStorageMethodThrow('setItem')
    mockCreateMembershipRefund
      .mockResolvedValueOnce({ refund: { id: 're_pending' }, cancellation_status: 'pending' })
      .mockResolvedValueOnce({ refund: { id: 're_pending' }, cancellation_status: 'completed' })
    const { container } = renderRefundForm()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(screen.getByPlaceholderText(/For example, 5\.00/), {
      target: { value: '500' },
    })
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() =>
      expect(mockToastWarning).toHaveBeenCalledWith(
        'Refund issued, but access could not be revoked.',
      ),
    )
    expect(mockCreateMembershipRefund).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Retry Access Revocation' })).toBeEnabled()
    expect(screen.getByPlaceholderText(/For example, 5\.00/)).toBeDisabled()
    expect(screen.getByRole('checkbox')).toBeChecked()

    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(2))
    expect(mockCreateMembershipRefund.mock.calls[1]![0]).toEqual(
      mockCreateMembershipRefund.mock.calls[0]![0],
    )
    expect(mockToastSuccess).toHaveBeenCalledWith('Refund issued and access revoked')
  })

  it('shows error toast when the refund API call fails', async () => {
    mockCreateMembershipRefund.mockRejectedValue(new Error('Stripe error'))
    const { container } = renderRefundForm()

    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Stripe error')
    })
    expect(onReload).not.toHaveBeenCalled()
  })

  it('reuses the idempotency token when an unchanged refund is retried after failure', async () => {
    mockCreateMembershipRefund
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockResolvedValueOnce({
        refund: { id: 're_retry' },
        cancellation_status: 'not_requested',
      })
    const firstRender = renderRefundForm()

    fireEvent.submit(firstRender.container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(1))
    firstRender.unmount()
    const freshRender = renderRefundForm()
    await waitFor(() => expect(screen.getByPlaceholderText(/For example, 5\.00/)).toBeEnabled())
    fireEvent.submit(freshRender.container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(2))

    expect(mockCreateMembershipRefund.mock.calls[1]![0]).toEqual(
      mockCreateMembershipRefund.mock.calls[0]![0],
    )
  })

  it('reuses the exact in-memory attempt after a lost response when storage persistence fails', async () => {
    makeStorageMethodThrow('setItem')
    mockCreateMembershipRefund
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockResolvedValueOnce({
        refund: { id: 're_retry' },
        cancellation_status: 'not_requested',
      })
    const { container } = renderRefundForm()

    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledOnce())
    expect(mockToastError).toHaveBeenCalledWith('Response lost')

    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(2))

    expect(mockCreateMembershipRefund.mock.calls[1]![0]).toEqual(
      mockCreateMembershipRefund.mock.calls[0]![0],
    )
  })

  it('rotates the idempotency token when refund intent changes after failure', async () => {
    mockCreateMembershipRefund
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockResolvedValueOnce({
        refund: { id: 're_changed' },
        cancellation_status: 'not_requested',
      })
    const { container } = renderRefundForm()

    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByPlaceholderText(/For example, 5\.00/), {
      target: { value: '500' },
    })
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(2))

    expect(mockCreateMembershipRefund.mock.calls[1]![0].idempotency_key).not.toBe(
      mockCreateMembershipRefund.mock.calls[0]![0].idempotency_key,
    )
  })

  it('rotates the idempotency token after a successful refund', async () => {
    const { container } = renderRefundForm()

    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(1))
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(2))

    expect(mockCreateMembershipRefund.mock.calls[1]![0].idempotency_key).not.toBe(
      mockCreateMembershipRefund.mock.calls[0]![0].idempotency_key,
    )
  })

  it('finishes terminal cleanup when storage removal fails and rotates the next intent token', async () => {
    const removeItem = makeStorageMethodThrow('removeItem')
    const { container } = renderRefundForm()

    fireEvent.change(screen.getByPlaceholderText(/For example, 5\.00/), {
      target: { value: '500' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Internal note/), {
      target: { value: '  First attempt  ' },
    })
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Goodwill refund issued'))
    expect(mockCreateMembershipRefund).toHaveBeenCalledOnce()
    expect(removeItem).toHaveBeenCalledOnce()
    expect(mockToastSuccess).toHaveBeenCalledWith('Goodwill refund issued')
    expect(mockToastError).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText(/For example, 5\.00/)).toHaveValue('')
    expect(screen.getByPlaceholderText(/Internal note/)).toHaveValue('')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(onReload).toHaveBeenCalledOnce()
    expect(mockRefresh).toHaveBeenCalledOnce()

    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(2))

    expect(mockCreateMembershipRefund.mock.calls[1]![0].idempotency_key).not.toBe(
      mockCreateMembershipRefund.mock.calls[0]![0].idempotency_key,
    )
  })

  it('tombstones a persisted pending attempt when terminal storage removal fails', async () => {
    mockCreateMembershipRefund
      .mockResolvedValueOnce({ refund: { id: 're_pending' }, cancellation_status: 'pending' })
      .mockResolvedValueOnce({ refund: { id: 're_pending' }, cancellation_status: 'completed' })
    const firstRender = renderRefundForm()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(screen.getByPlaceholderText(/For example, 5\.00/), {
      target: { value: '500' },
    })
    fireEvent.submit(firstRender.container.querySelector('form')!)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry Access Revocation' })).toBeEnabled(),
    )
    expect(sessionStorage).toHaveLength(1)

    makeStorageMethodThrow('removeItem')
    fireEvent.submit(firstRender.container.querySelector('form')!)
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Refund issued and access revoked'),
    )

    firstRender.unmount()
    renderRefundForm()

    expect(screen.getByRole('button', { name: 'Issue Refund' })).toBeEnabled()
    expect(screen.getByPlaceholderText(/For example, 5\.00/)).toBeEnabled()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
})
