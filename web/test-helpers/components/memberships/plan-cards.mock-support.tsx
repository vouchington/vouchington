import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeatureFlagsProvider } from '@/lib/feature-flags/context'
import type { MembershipPlanSku, SubscriptionMembership } from '@/types/api-responses'

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

vi.mock(
  import('../../../components/memberships/billing-portal-button'),
  () =>
    ({
      BillingPortalButton: () => <Button type='button'>Manage Billing</Button>,
    }) as unknown as typeof import('../../../components/memberships/billing-portal-button'),
)

vi.mock(
  import('../../../components/memberships/checkout-button'),
  () =>
    ({
      CheckoutButton: ({ planName }: { planName: string }) => (
        <Button type='button'>Subscribe to {planName}</Button>
      ),
    }) as unknown as typeof import('../../../components/memberships/checkout-button'),
)

export function renderWithProviders(ui: ReactNode) {
  return render(
    <FeatureFlagsProvider globalFlags={{ memberships: true, membershipStripeBilling: true }}>
      <TooltipProvider>{ui}</TooltipProvider>
    </FeatureFlagsProvider>,
  )
}

export const MOCK_PLANS: Record<string, MembershipPlanSku[]> = {
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

export const BASE_MEMBERSHIP: SubscriptionMembership = {
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
