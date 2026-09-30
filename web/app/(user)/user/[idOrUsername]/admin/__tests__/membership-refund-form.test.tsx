import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mockCreateMembershipRefund,
  mockRefresh,
  mockToastError,
  mockToastSuccess,
  mockToastWarning,
  onReload,
  renderMembershipRefundForm as renderRefundForm,
  resetMembershipRefundFormTest,
} from '@/test-helpers/app/user/membership-refund-form.mock-support'

const storageMethodSpies: Array<{ mockRestore(): void }> = []

function makeStorageMethodThrow(method: 'setItem' | 'removeItem') {
  const storagePrototype = Object.getPrototypeOf(sessionStorage) as Storage
  const spy = vi.spyOn(storagePrototype, method).mockImplementation(() => {
    throw new DOMException('Storage unavailable', 'QuotaExceededError')
  })
  storageMethodSpies.push(spy)
  return spy
}

describe('MembershipRefundForm', () => {
  beforeEach(resetMembershipRefundFormTest)

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

  it('keeps a pending reconciliation locked in memory when storage persistence fails', async () => {
    makeStorageMethodThrow('setItem')
    mockCreateMembershipRefund.mockResolvedValueOnce({
      cancellation_status: 'pending',
      outcome: 'completed',
      refund: { id: 're_pending' },
    })
    const { container } = renderRefundForm()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(screen.getByPlaceholderText(/For example, 5\.00/), {
      target: { value: '500' },
    })
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() =>
      expect(mockToastWarning).toHaveBeenCalledWith(
        'Refund reconciliation is continuing automatically.',
      ),
    )
    expect(mockCreateMembershipRefund).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Reconciling Refund' })).toBeDisabled()
    expect(screen.getByPlaceholderText(/For example, 5\.00/)).toBeDisabled()
    expect(screen.getByRole('checkbox')).toBeChecked()
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
        cancellation_status: 'not_requested',
        outcome: 'completed',
        refund: { id: 're_retry' },
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
        cancellation_status: 'not_requested',
        outcome: 'completed',
        refund: { id: 're_retry' },
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
        cancellation_status: 'not_requested',
        outcome: 'completed',
        refund: { id: 're_changed' },
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
})
