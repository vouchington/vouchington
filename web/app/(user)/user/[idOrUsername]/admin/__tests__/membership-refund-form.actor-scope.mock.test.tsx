import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MembershipRefundForm } from '../membership-refund-form'
import type { RefundableCharge } from '@/types/api-responses'

const { mockCreateMembershipRefund } = vi.hoisted(() => ({
  mockCreateMembershipRefund: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: vi.fn<VitestLooseMock>(),
        warning: vi.fn<VitestLooseMock>(),
        error: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('sonner'),
)
vi.mock(import('@/lib/api/client/memberships'), () => ({
  fetchRefundableCharges: vi.fn<VitestLooseMock>(),
  createMembershipRefund: mockCreateMembershipRefund,
}))

const charge: RefundableCharge = {
  charge_id: 'ch_actor_scope',
  payment_intent_id: null,
  invoice_id: 'in_actor_scope',
  amount: { amount: 2000, currency: 'usd' },
  amount_refunded: { amount: 0, currency: 'usd' },
  created_at: '2026-01-15T00:00:00.000Z',
  description: 'Annual plan',
}

function renderForm(actorUserId: string) {
  return render(
    <MembershipRefundForm
      actorUserId={actorUserId}
      userId='user-1'
      charges={[charge]}
      onReload={vi.fn<VitestLooseMock>()}
    />,
  )
}

describe('MembershipRefundForm actor scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockCreateMembershipRefund.mockRejectedValue(new Error('Response lost'))
  })

  it('isolates persisted attempts by signed-in actor', async () => {
    const actorA = renderForm('admin-a')
    fireEvent.submit(actorA.container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(1))
    const actorAToken = mockCreateMembershipRefund.mock.calls[0]![0].idempotency_key
    actorA.unmount()

    const actorB = renderForm('admin-b')
    fireEvent.submit(actorB.container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(2))
    expect(mockCreateMembershipRefund.mock.calls[1]![0].idempotency_key).not.toBe(actorAToken)
    actorB.unmount()

    const restoredActorA = renderForm('admin-a')
    fireEvent.submit(restoredActorA.container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(3))
    expect(mockCreateMembershipRefund.mock.calls[2]![0].idempotency_key).toBe(actorAToken)
  })

  it('resets the live attempt when the signed-in actor changes in place', async () => {
    const view = renderForm('admin-a')
    fireEvent.submit(view.container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledOnce())
    const actorAToken = mockCreateMembershipRefund.mock.calls[0]![0].idempotency_key

    view.rerender(
      <MembershipRefundForm
        actorUserId='admin-b'
        userId='user-1'
        charges={[charge]}
        onReload={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Issue Refund' })).toBeEnabled()
    fireEvent.submit(view.container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledTimes(2))
    expect(mockCreateMembershipRefund.mock.calls[1]![0].idempotency_key).not.toBe(actorAToken)
  })

  it('ignores an old target-only storage entry and creates a fresh actor-scoped attempt', async () => {
    const oldToken = '11111111-1111-4111-8111-111111111111'
    const oldRequest = {
      user_id: 'user-1',
      charge_id: charge.charge_id,
      payment_intent_id: null,
      invoice_id: charge.invoice_id,
      reason: 'requested',
      cancel: true,
      note: 'old admin attempt',
    }
    sessionStorage.setItem(
      'voucha:membership-refund-attempt:user-1',
      JSON.stringify({
        request: oldRequest,
        requestFingerprint: JSON.stringify(oldRequest),
        idempotencyKey: oldToken,
        cancellationPending: true,
      }),
    )

    const view = renderForm('admin-new')
    expect(screen.getByRole('button', { name: 'Issue Refund' })).toBeEnabled()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    fireEvent.submit(view.container.querySelector('form')!)
    await waitFor(() => expect(mockCreateMembershipRefund).toHaveBeenCalledOnce())

    expect(mockCreateMembershipRefund.mock.calls[0]![0].idempotency_key).not.toBe(oldToken)
  })
})
