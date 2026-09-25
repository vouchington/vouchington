import { describe, it, expect, vi } from 'vitest'

import { render, screen } from '@testing-library/react'

import type { ReactNode } from 'react'

import { TooltipProvider } from '@/components/ui/tooltip'
import { FeatureFlagsProvider } from '@/lib/feature-flags/context'

import { PlanCards } from '../plan-cards'

import type { MembershipPlanSku, SubscriptionMembership } from '@/types/api-responses'

function renderWithProviders(ui: ReactNode) {
  return render(
    <FeatureFlagsProvider globalFlags={{ memberships: true, membershipStripeBilling: true }}>
      <TooltipProvider>{ui}</TooltipProvider>
    </FeatureFlagsProvider>,
  )
}

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('../billing-portal-button'), () => ({
  BillingPortalButton: () => <button type='button'>Manage Billing</button>,
}))

vi.mock(import('../checkout-button'), () => ({
  CheckoutButton: ({ planName }: { planName: string }) => (
    <button type='button'>Subscribe to {planName}</button>
  ),
}))

const MOCK_PLANS: Record<string, MembershipPlanSku[]> = {
  plus: [
    {
      id: 'plus-monthly',
      plan: 'plus',
      price: { amount: 500, currency: 'usd' },
      interval: 'monthly',
      stripe_price_id: 'price_plus_monthly',
    },
    {
      id: 'plus-yearly',
      plan: 'plus',
      price: { amount: 5000, currency: 'usd' },
      interval: 'yearly',
      stripe_price_id: 'price_plus_yearly',
    },
  ],
  pro: [
    {
      id: 'pro-monthly',
      plan: 'pro',
      price: { amount: 1000, currency: 'usd' },
      interval: 'monthly',
      stripe_price_id: 'price_pro_monthly',
    },
    {
      id: 'pro-yearly',
      plan: 'pro',
      price: { amount: 10_000, currency: 'usd' },
      interval: 'yearly',
      stripe_price_id: 'price_pro_yearly',
    },
  ],
}

const BASE_MEMBERSHIP: SubscriptionMembership = {
  __entity_type: 'membership',
  id: 'mem-1',
  user_id: 'user-1',
  plan: 'plus',
  status: 'active',
  started_at: '2026-01-01T00:00:00.000Z',
  expires_at: null,
  has_stripe_subscription: true,
  granted_by_id: null,
  cancelled_at: null,
  expired_at: null,
  past_due_at: null,
  paused_at: null,
  cancel_at_period_end: false,
  latest_change_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  sku: {
    id: 'sku-1',
    plan: 'plus',
    price: { amount: 500, currency: 'usd' },
    interval: 'monthly',
    stripe_price_id: 'price_plus_monthly',
    retired_at: null,
  },
}

describe('PlanCards', () => {
  it('marks Free as current plan when user has no paid membership', () => {
    renderWithProviders(
      <PlanCards
        plans={MOCK_PLANS}
        membership={null}
      />,
    )

    // Free card shows a "Current Plan" badge (span) and a disabled "Current Plan" button
    const currentPlanElements = screen.getAllByText('Current Plan')
    expect(currentPlanElements.length).toBeGreaterThan(0)

    // Plus and Pro cards still show checkout buttons
    expect(screen.getByRole('button', { name: /subscribe to plus/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /subscribe to pro/i })).toBeInTheDocument()
  })

  it('marks Plus as current plan and shows Manage Billing for Stripe subscribers', () => {
    renderWithProviders(
      <PlanCards
        plans={MOCK_PLANS}
        membership={BASE_MEMBERSHIP}
      />,
    )

    expect(screen.getByText('Current Plan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /manage billing/i })).toBeInTheDocument()
  })

  it('shows disabled Current Plan button for admin-granted membership without Stripe', () => {
    const grantedMembership: SubscriptionMembership = {
      ...BASE_MEMBERSHIP,
      has_stripe_subscription: false,
      granted_by_id: 'admin-1',
    }
    renderWithProviders(
      <PlanCards
        plans={MOCK_PLANS}
        membership={grantedMembership}
      />,
    )

    const disabledBtn = screen.getByRole('button', { name: 'Current Plan' })
    expect(disabledBtn).toBeDisabled()
  })

  it('marks Pro as current plan for Pro subscribers', () => {
    const proMembership: SubscriptionMembership = {
      ...BASE_MEMBERSHIP,
      plan: 'pro',
      sku: {
        ...BASE_MEMBERSHIP.sku,
        plan: 'pro',
        price: { amount: 1000, currency: 'usd' },
      },
    }
    renderWithProviders(
      <PlanCards
        plans={MOCK_PLANS}
        membership={proMembership}
      />,
    )

    expect(screen.getByText('Current Plan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /manage billing/i })).toBeInTheDocument()
    // Plus card should still show checkout button
    expect(screen.getByRole('button', { name: /subscribe to plus/i })).toBeInTheDocument()
  })

  it('does not mark cancelled membership plan as current', () => {
    const cancelledMembership: SubscriptionMembership = {
      ...BASE_MEMBERSHIP,
      status: 'cancelled',
      cancelled_at: '2026-02-01T00:00:00.000Z',
    }
    renderWithProviders(
      <PlanCards
        plans={MOCK_PLANS}
        membership={cancelledMembership}
      />,
    )

    // Cancelled membership — Free plan should be marked as current
    const freeHeading = screen.getByRole('heading', { name: 'Free' })
    const freeCard = freeHeading.closest('.relative')!
    expect(freeCard).toHaveTextContent('Current Plan')
    // Plus should show checkout button, not current plan
    expect(screen.getByRole('button', { name: /subscribe to plus/i })).toBeInTheDocument()
  })

  it('does not mark paused membership plan as current', () => {
    renderWithProviders(
      <PlanCards
        plans={MOCK_PLANS}
        membership={{ ...BASE_MEMBERSHIP, status: 'paused', paused_at: '2026-02-01T00:00:00Z' }}
      />,
    )

    const freeCard = screen.getByRole('heading', { name: 'Free' }).closest('.relative')!
    expect(freeCard).toHaveTextContent('Current Plan')
    expect(screen.getByRole('button', { name: /manage billing/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /subscribe to plus/i })).not.toBeInTheDocument()
  })
})
