import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeatureFlagsProvider } from '@/lib/feature-flags/context'
import type { MembershipPlanSku, SubscriptionMembership } from '@/types/api-responses'
import { PlanCards } from '../plan-cards'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('../billing-portal-button'), () => ({
  BillingPortalButton: () => <button type='button'>Manage Billing</button>,
}))

const plans: Record<string, MembershipPlanSku[]> = {
  plus: [
    {
      id: 'plus-monthly',
      plan: 'plus',
      price: { amount: 500, currency: 'usd' },
      interval: 'monthly',
      stripe_price_id: 'price_plus_monthly',
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
  ],
}

function renderPlanCards(flags: { memberships: boolean; membershipStripeBilling: boolean }) {
  return render(
    <FeatureFlagsProvider globalFlags={flags}>
      <TooltipProvider>
        <PlanCards plans={plans} />
      </TooltipProvider>
    </FeatureFlagsProvider>,
  )
}

describe('PlanCards purchase flags', () => {
  it.each([
    { memberships: false, membershipStripeBilling: false },
    { memberships: true, membershipStripeBilling: false },
    { memberships: false, membershipStripeBilling: true },
  ])('hides purchase CTAs unless both flags are enabled', flags => {
    renderPlanCards(flags)

    expect(screen.getByText('$5.00')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /subscribe to plus/i })).not.toBeInTheDocument()
  })

  it('shows purchase CTAs only when both flags are enabled', () => {
    renderPlanCards({ memberships: true, membershipStripeBilling: true })

    expect(screen.getByRole('link', { name: /subscribe to plus/i })).toBeInTheDocument()
  })

  it('keeps Stripe billing management visible when purchases are disabled', () => {
    const membership: SubscriptionMembership = {
      __entity_type: 'membership',
      id: 'membership-1',
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
      sku: { ...plans.plus![0]!, retired_at: null },
    }
    render(
      <FeatureFlagsProvider globalFlags={{ memberships: false, membershipStripeBilling: false }}>
        <TooltipProvider>
          <PlanCards
            plans={plans}
            membership={membership}
          />
        </TooltipProvider>
      </FeatureFlagsProvider>,
    )

    expect(screen.getByRole('button', { name: /manage billing/i })).toBeInTheDocument()
  })
})
