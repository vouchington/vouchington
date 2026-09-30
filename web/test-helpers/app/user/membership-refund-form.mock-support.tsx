import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import { MembershipRefundForm } from '@/app/(user)/user/[idOrUsername]/admin/membership-refund-form'
import type { MembershipRefundResponseBody, RefundableCharge } from '@/types/api-responses'

const membershipRefundNav = createNavMock()

const { mockCreateMembershipRefund, mockToastError, mockToastSuccess, mockToastWarning } =
  vi.hoisted(() => ({
    mockCreateMembershipRefund: vi.fn<VitestLooseMock>(),
    mockToastError: vi.fn<VitestLooseMock>(),
    mockToastSuccess: vi.fn<VitestLooseMock>(),
    mockToastWarning: vi.fn<VitestLooseMock>(),
  }))

vi.mock(import('next/navigation'), () => navMockModule)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        error: mockToastError,
        success: mockToastSuccess,
        warning: mockToastWarning,
      },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/api/client/memberships'), () => ({
  createMembershipRefund: mockCreateMembershipRefund,
  fetchRefundableCharges: vi.fn<VitestLooseMock>(),
}))

const completedMembershipRefund: MembershipRefundResponseBody = {
  cancellation_status: 'not_requested',
  outcome: 'completed',
  refund: { id: 're_test' },
}

export const fakeCharge: RefundableCharge = {
  amount: { amount: 2000, currency: 'usd' },
  amount_refunded: { amount: 0, currency: 'usd' },
  charge_id: 'ch_test',
  created_at: '2026-01-15T00:00:00.000Z',
  description: 'Annual plan',
  invoice_id: 'in_test',
  payment_intent_id: null,
}

export const mockRefresh = membershipRefundNav.refresh

export const onReload = vi.fn<VitestLooseMock>()

export { mockCreateMembershipRefund, mockToastError, mockToastSuccess, mockToastWarning }

export function resetMembershipRefundFormTest() {
  membershipRefundNav.reset()
  vi.clearAllMocks()
  sessionStorage.clear()
  mockCreateMembershipRefund.mockResolvedValue(completedMembershipRefund)
}

export function renderMembershipRefundForm(
  charges: RefundableCharge[] = [fakeCharge],
  actorUserId = 'admin-1',
) {
  return render(
    <MembershipRefundForm
      actorUserId={actorUserId}
      charges={charges}
      onReload={onReload}
      userId='user-1'
    />,
  )
}
