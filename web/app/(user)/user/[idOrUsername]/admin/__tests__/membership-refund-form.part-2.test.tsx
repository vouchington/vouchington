import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RefundableCharge } from '@/types/api-responses'
import {
  fakeCharge,
  mockCreateMembershipRefund,
  mockRefresh,
  mockToastError,
  mockToastSuccess,
  mockToastWarning,
  onReload,
  renderMembershipRefundForm,
  resetMembershipRefundFormTest,
} from '@/test-helpers/app/user/membership-refund-form.mock-support'

const partiallyRefundedCharge: RefundableCharge = {
  amount: { amount: 1000, currency: 'usd' },
  amount_refunded: { amount: 500, currency: 'usd' },
  charge_id: 'ch_partial',
  created_at: '2026-01-10T00:00:00.000Z',
  description: null,
  invoice_id: 'in_partial',
  payment_intent_id: null,
}

const paymentIntentOnlyCharge: RefundableCharge = {
  amount: { amount: 1500, currency: 'usd' },
  amount_refunded: { amount: 0, currency: 'usd' },
  charge_id: null,
  created_at: '2026-01-12T00:00:00.000Z',
  description: 'Invoice payment intent',
  invoice_id: 'in_payment_intent',
  payment_intent_id: 'pi_test',
}

const jpyCharge: RefundableCharge = {
  amount: { amount: 1000, currency: 'jpy' },
  amount_refunded: { amount: 0, currency: 'jpy' },
  charge_id: 'ch_jpy',
  created_at: '2026-01-11T00:00:00.000Z',
  description: 'JPY charge',
  invoice_id: 'in_jpy',
  payment_intent_id: null,
}

function renderRefundForm(charges: RefundableCharge[] = [fakeCharge]) {
  return renderMembershipRefundForm(charges)
}

describe('MembershipRefundForm behavior', () => {
  beforeEach(resetMembershipRefundFormTest)

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
          cancel: false,
          charge_id: 'ch_test',
          invoice_id: 'in_test',
          note: null,
          reason: 'goodwill',
          user_id: 'user-1',
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
          invoice_id: 'in_payment_intent',
          payment_intent_id: 'pi_test',
        }),
      )
    })
  })

  it('shows revoke button text and submits revoke refund when cancel is checked', async () => {
    mockCreateMembershipRefund.mockResolvedValue({
      cancellation_status: 'completed',
      outcome: 'completed',
      refund: { id: 're_test' },
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

  it('restores and locks a pending access-revocation reconciliation', async () => {
    mockCreateMembershipRefund.mockResolvedValueOnce({
      cancellation_status: 'pending',
      outcome: 'completed',
      refund: { id: 're_pending' },
    })
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
        'Refund reconciliation is continuing automatically.',
      ),
    )
    expect(mockCreateMembershipRefund).toHaveBeenCalledOnce()
    expect(mockToastError).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Reconciling Refund' })).toBeDisabled()

    firstRender.unmount()
    const freshRender = renderRefundForm([paymentIntentOnlyCharge, fakeCharge])
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reconciling Refund' })).toBeDisabled(),
    )
    expect(screen.getByPlaceholderText(/For example, 5\.00/)).toBeDisabled()
    expect(screen.getByPlaceholderText(/Internal note/)).toBeDisabled()
    expect(freshRender.container.querySelector('form')).toBeInTheDocument()
    expect(mockCreateMembershipRefund).toHaveBeenCalledOnce()
    expect(onReload).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
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
