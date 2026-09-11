import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const partiallyRefundedCharge: RefundableCharge = {
  charge_id: 'ch_partial',
  payment_intent_id: null,
  invoice_id: 'in_partial',
  amount: { amount: 1000, currency: 'usd' },
  amount_refunded: { amount: 500, currency: 'usd' },
  created_at: '2026-01-10T00:00:00.000Z',
  description: null,
}

const paymentIntentOnlyCharge: RefundableCharge = {
  charge_id: null,
  payment_intent_id: 'pi_test',
  invoice_id: 'in_payment_intent',
  amount: { amount: 1500, currency: 'usd' },
  amount_refunded: { amount: 0, currency: 'usd' },
  created_at: '2026-01-12T00:00:00.000Z',
  description: 'Invoice payment intent',
}

const jpyCharge: RefundableCharge = {
  charge_id: 'ch_jpy',
  payment_intent_id: null,
  invoice_id: 'in_jpy',
  amount: { amount: 1000, currency: 'jpy' },
  amount_refunded: { amount: 0, currency: 'jpy' },
  created_at: '2026-01-11T00:00:00.000Z',
  description: 'JPY charge',
}

const onReload = vi.fn<VitestLooseMock>()

function renderRefundForm(charges: RefundableCharge[] = [fakeCharge]) {
  return render(
    <MembershipRefundForm
      actorUserId='admin-1'
      userId='user-1'
      charges={charges}
      onReload={onReload}
    />,
  )
}

describe('MembershipRefundForm behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockCreateMembershipRefund.mockResolvedValue({
      refund: { id: 're_test' },
      cancellation_status: 'not_requested',
    })
  })

  it('renders charge options with amount and description', () => {
    renderRefundForm()
    expect(screen.getByText(/\$20.00/)).toBeInTheDocument()
    expect(screen.getByText(/Annual plan/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Issue Refund' })).toBeInTheDocument()
  })

  it('shows already-refunded amount for partially-refunded charges', () => {
    renderRefundForm([partiallyRefundedCharge])
    expect(screen.getByText(/5.00 already refunded/)).toBeInTheDocument()
  })

  it('submits a goodwill refund and shows success toast', async () => {
    const { container } = renderRefundForm()

    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => {
      expect(mockCreateMembershipRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          charge_id: 'ch_test',
          invoice_id: 'in_test',
          reason: 'goodwill',
          cancel: false,
          note: null,
        }),
      )
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('Goodwill refund issued')
    expect(onReload).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
    expect(sessionStorage).toHaveLength(0)
  })

  it('uses a not-requested response as the terminal goodwill outcome', async () => {
    const { container } = renderRefundForm()

    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Goodwill refund issued'))
    expect(mockToastWarning).not.toHaveBeenCalled()
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockCreateMembershipRefund).toHaveBeenCalledOnce()
    expect(onReload).toHaveBeenCalledOnce()
    expect(mockRefresh).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Issue Refund' })).toBeEnabled())
    expect(screen.getByPlaceholderText(/For example, 5\.00/)).toHaveValue('')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(sessionStorage).toHaveLength(0)
  })

  it('submits the selected payment-intent-only charge', async () => {
    const { container } = renderRefundForm([fakeCharge, paymentIntentOnlyCharge])

    fireEvent.click(screen.getByText(/Invoice payment intent/))
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => {
      expect(mockCreateMembershipRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          charge_id: null,
          payment_intent_id: 'pi_test',
          invoice_id: 'in_payment_intent',
        }),
      )
    })
  })

  it('shows revoke button text and submits revoke refund when cancel is checked', async () => {
    mockCreateMembershipRefund.mockResolvedValue({
      refund: { id: 're_test' },
      cancellation_status: 'completed',
    })
    const { container } = renderRefundForm()

    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Refund & Revoke Access' })).toBeInTheDocument()
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => {
      expect(mockCreateMembershipRefund).toHaveBeenCalledWith(
        expect.objectContaining({ cancel: true }),
      )
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('Refund issued and access revoked')
  })

  it('restores pending access revocation and completes an exact retry', async () => {
    mockCreateMembershipRefund
      .mockResolvedValueOnce({ refund: { id: 're_pending' }, cancellation_status: 'pending' })
      .mockResolvedValueOnce({ refund: { id: 're_pending' }, cancellation_status: 'completed' })
    const firstRender = renderRefundForm()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(screen.getByPlaceholderText(/For example, 5\.00/), {
      target: { value: '500' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Internal note/), {
      target: { value: '  Revoke access  ' },
    })
    fireEvent.submit(firstRender.container.querySelector('form')!)

    await waitFor(() =>
      expect(mockToastWarning).toHaveBeenCalledWith(
        'Refund issued, but access could not be revoked.',
      ),
    )
    expect(mockCreateMembershipRefund).toHaveBeenCalledOnce()
    expect(mockToastError).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Retry Access Revocation' })).toBeEnabled()

    firstRender.unmount()
    const freshRender = renderRefundForm([paymentIntentOnlyCharge, fakeCharge])
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry Access Revocation' })).toBeEnabled(),
    )
    expect(screen.getByPlaceholderText(/For example, 5\.00/)).toBeDisabled()
    expect(screen.getByPlaceholderText(/Internal note/)).toBeDisabled()
    fireEvent.submit(freshRender.container.querySelector('form')!)

    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(2))
    expect(mockCreateMembershipRefund.mock.calls[1]![0]).toEqual(
      mockCreateMembershipRefund.mock.calls[0]![0],
    )
    expect(mockToastSuccess).toHaveBeenCalledWith('Refund issued and access revoked')
    expect(onReload).toHaveBeenCalledOnce()
    expect(mockRefresh).toHaveBeenCalledOnce()
  })

  it('normalizes the optional amount and note fields', async () => {
    const { container } = renderRefundForm()

    fireEvent.change(screen.getByPlaceholderText(/For example, 5\.00/), {
      target: { value: '500' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Internal note/), {
      target: { value: '  Goodwill refund  ' },
    })
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => {
      expect(mockCreateMembershipRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: { amount: 50_000, currency: 'usd' },
          note: 'Goodwill refund',
        }),
      )
    })
  })

  it('clears only the partial amount when the selected charge changes', async () => {
    const { container } = renderRefundForm([jpyCharge, fakeCharge])

    fireEvent.change(screen.getByPlaceholderText(/For example, 500/), {
      target: { value: '500' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Internal note/), {
      target: { value: '  Keep this note  ' },
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByText(/Annual plan/))

    expect(screen.getByPlaceholderText(/For example, 5\.00/)).toHaveValue('')
    expect(screen.getByPlaceholderText(/Internal note/)).toHaveValue('  Keep this note  ')
    expect(screen.getByRole('checkbox')).toBeChecked()

    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() =>
      expect(mockCreateMembershipRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: undefined,
          cancel: true,
          note: 'Keep this note',
          reason: 'goodwill',
        }),
      ),
    )
  })

  it('uses exact decimal text entry for every selected currency', () => {
    renderRefundForm([jpyCharge, fakeCharge])

    const jpyAmount = screen.getByPlaceholderText(/For example, 500/)
    expect(jpyAmount).toHaveAttribute('inputmode', 'decimal')

    fireEvent.click(screen.getByText(/Annual plan/))
    const usdAmount = screen.getByPlaceholderText(/For example, 5\.00/)
    expect(usdAmount).toHaveAttribute('inputmode', 'decimal')
  })
})
