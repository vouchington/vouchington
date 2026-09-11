import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MembershipRefundPanel } from '../membership-refund-panel'

const { mockFetchRefundableCharges } = vi.hoisted(() => ({
  mockFetchRefundableCharges: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/memberships'), () => ({
  fetchRefundableCharges: mockFetchRefundableCharges,
  createMembershipRefund: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('../membership-refund-form.tsx'),
  () =>
    ({
      MembershipRefundForm: ({
        actorUserId,
        userId,
        charges,
        onReload,
      }: {
        actorUserId: string
        userId: string
        charges: Array<{ charge_id: string }>
        onReload: () => void
      }) => (
        <div
          data-pw='membership-refund-form-stub'
          data-user-id={userId}
          data-actor-user-id={actorUserId}
          data-charge-ids={charges.map(charge => charge.charge_id).join(',')}
          data-charge-count={String(charges.length)}
        >
          <button
            type='button'
            onClick={onReload}
          >
            Reload charges
          </button>
          <button
            type='button'
            onClick={() => {
              onReload()
              onReload()
            }}
          >
            Reload charges twice
          </button>
        </div>
      ),
    }) as unknown as typeof import('../membership-refund-form.tsx'),
)

const fakeCharge = {
  charge_id: 'ch_abc',
  payment_intent_id: null,
  invoice_id: 'in_abc',
  amount: { amount: 1000, currency: 'usd' },
  amount_refunded: { amount: 0, currency: 'usd' },
  created_at: '2026-01-01T00:00:00.000Z',
  description: null,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('MembershipRefundPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially while fetching', () => {
    mockFetchRefundableCharges.mockReturnValue(new Promise(() => {}))
    render(
      <MembershipRefundPanel
        actorUserId='admin-1'
        userId='user-1'
      />,
    )
    expect(screen.getByText(/Loading charges/)).toBeInTheDocument()
  })

  it('shows empty state when no refundable charges exist', async () => {
    mockFetchRefundableCharges.mockResolvedValue({ charges: [] })
    render(
      <MembershipRefundPanel
        actorUserId='admin-1'
        userId='user-1'
      />,
    )
    await waitFor(() => {
      expect(screen.getByText(/No refundable charges/)).toBeInTheDocument()
    })
  })

  it('renders the refund form when charges are available', async () => {
    mockFetchRefundableCharges.mockResolvedValue({ charges: [fakeCharge] })
    const { container } = render(
      <MembershipRefundPanel
        actorUserId='admin-1'
        userId='user-1'
      />,
    )
    await waitFor(() => {
      const stub = container.querySelector('[data-pw="membership-refund-form-stub"]')
      expect(stub).not.toBeNull()
      expect(stub?.getAttribute('data-user-id')).toBe('user-1')
      expect(stub?.getAttribute('data-actor-user-id')).toBe('admin-1')
      expect(stub?.getAttribute('data-charge-count')).toBe('1')
    })
  })

  it('falls back to empty state when the charges fetch fails', async () => {
    mockFetchRefundableCharges.mockRejectedValue(new Error('Network error'))
    render(
      <MembershipRefundPanel
        actorUserId='admin-1'
        userId='user-1'
      />,
    )
    await waitFor(() => {
      expect(screen.getByText(/No refundable charges/)).toBeInTheDocument()
    })
  })

  it('does not show charges from a previous user whose request finishes late', async () => {
    const previousUser = deferred<{ charges: (typeof fakeCharge)[] }>()
    const currentUser = deferred<{ charges: (typeof fakeCharge)[] }>()
    mockFetchRefundableCharges
      .mockReturnValueOnce(previousUser.promise)
      .mockReturnValueOnce(currentUser.promise)

    const { container, rerender } = render(
      <MembershipRefundPanel
        actorUserId='admin-1'
        userId='user-1'
      />,
    )
    rerender(
      <MembershipRefundPanel
        actorUserId='admin-1'
        userId='user-2'
      />,
    )

    await act(async () => {
      currentUser.resolve({ charges: [{ ...fakeCharge, charge_id: 'ch_current' }] })
    })
    expect(container.querySelector('[data-user-id="user-2"]')).not.toBeNull()

    await act(async () => {
      previousUser.resolve({ charges: [{ ...fakeCharge, charge_id: 'ch_previous' }] })
    })
    expect(container.querySelector('[data-user-id="user-2"]')).not.toBeNull()
  })

  it('keeps the newest reload result when an earlier reload finishes late', async () => {
    const initial = deferred<{ charges: (typeof fakeCharge)[] }>()
    const earlierReload = deferred<{ charges: (typeof fakeCharge)[] }>()
    const latestReload = deferred<{ charges: (typeof fakeCharge)[] }>()
    mockFetchRefundableCharges
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(earlierReload.promise)
      .mockReturnValueOnce(latestReload.promise)

    const { container } = render(
      <MembershipRefundPanel
        actorUserId='admin-1'
        userId='user-1'
      />,
    )
    await act(async () => {
      initial.resolve({ charges: [fakeCharge] })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reload charges twice' }))
    await act(async () => {
      latestReload.resolve({ charges: [{ ...fakeCharge, charge_id: 'ch_latest' }] })
    })
    expect(container.querySelector('[data-charge-ids="ch_latest"]')).not.toBeNull()

    await act(async () => {
      earlierReload.resolve({ charges: [{ ...fakeCharge, charge_id: 'ch_earlier' }] })
    })
    expect(container.querySelector('[data-charge-ids="ch_latest"]')).not.toBeNull()
  })
})
