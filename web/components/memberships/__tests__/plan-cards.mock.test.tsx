import { describe, it, expect, vi } from 'vitest'

import { render, screen, fireEvent } from '@testing-library/react'

import type { ReactNode } from 'react'

import { TooltipProvider } from '@/components/ui/tooltip'
import { FeatureFlagsProvider } from '@/lib/feature-flags/context'

import { PlanCards } from '../plan-cards'

import type {
  MembershipBenefitCatalog,
  MembershipPlanSku,
  SubscriptionMembership,
} from '@/types/api-responses'
import plansFixture from '../../../../api-fixtures/v1/responses/native.memberships.plans.default.json'

const BENEFIT_CATALOG: MembershipBenefitCatalog = {
  version: 1,
  groups: [
    {
      id: 'contribute',
      benefits: [
        {
          id: 'contribution_capacity',
          placements: ['card', 'comparison'],
          values: {
            free: { kind: 'level', level: 'standard' },
            plus: { kind: 'level', level: 'more' },
            pro: { kind: 'level', level: 'most' },
          },
        },
      ],
    },
  ],
}

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
  it('renders all three plan cards', () => {
    renderWithProviders(<PlanCards plans={MOCK_PLANS} />)

    expect(screen.getByRole('heading', { name: 'Free' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /plus/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /pro/i })).toBeInTheDocument()
  })

  it('shows monthly pricing by default', () => {
    renderWithProviders(<PlanCards plans={MOCK_PLANS} />)

    expect(screen.getByText('$5.00')).toBeInTheDocument()
    expect(screen.getByText('$10.00')).toBeInTheDocument()
  })

  it('switches to yearly pricing when yearly toggle is clicked', () => {
    renderWithProviders(<PlanCards plans={MOCK_PLANS} />)

    fireEvent.click(screen.getByRole('button', { name: 'Yearly' }))

    expect(screen.getByText('$50.00')).toBeInTheDocument()
    expect(screen.getByText('$100.00')).toBeInTheDocument()
  })

  it('shows value prop messaging about paid member immediate access', () => {
    renderWithProviders(<PlanCards plans={MOCK_PLANS} />)

    expect(screen.getByText(/Paid members contribute immediately/i)).toBeInTheDocument()
  })

  it('renders tooltip feature labels as buttons for keyboard access', () => {
    renderWithProviders(
      <PlanCards
        benefitCatalog={BENEFIT_CATALOG}
        plans={MOCK_PLANS}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Contribution capacity: Standard' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/vote weight|contributions\/day/i)).not.toBeInTheDocument()
  })

  it('renders localized availability labels from the complete catalog', () => {
    const catalog = plansFixture.benefit_catalog as MembershipBenefitCatalog
    renderWithProviders(
      <PlanCards
        benefitCatalog={catalog}
        plans={MOCK_PLANS}
      />,
    )

    const unavailable = screen.getByRole('button', {
      name: 'Post downvote counts: Not included',
    })
    const included = screen.getAllByRole('button', { name: 'Post downvote counts: Included' })
    expect(unavailable.closest('li')?.querySelector('.lucide-x')).not.toBeNull()
    expect(included).toHaveLength(2)
    expect(included[0]?.closest('li')?.querySelector('.lucide-check')).not.toBeNull()
    expect(screen.queryByText(/Post downvote counts: (true|false)/)).not.toBeInTheDocument()
  })

  it('does not show Current Plan badge when user is not logged in', () => {
    renderWithProviders(<PlanCards plans={MOCK_PLANS} />)

    expect(screen.queryByText('Current Plan')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /get started/i })).toBeInTheDocument()
  })

  it('"Get Started" button uses default variant, not outline', () => {
    renderWithProviders(<PlanCards plans={MOCK_PLANS} />)

    const link = screen.getByRole('link', { name: /get started/i })
    // The Button renders the variant as a class on the element. Default variant adds
    // bg-primary; outline variant adds border and no background fill class.
    const btn = link.closest('a') ?? link
    expect(btn.className).not.toContain('border-input')
    expect(btn.className).toContain('bg-primary')
  })

  it('links signed-out paid plan CTAs to login instead of checkout', () => {
    renderWithProviders(<PlanCards plans={MOCK_PLANS} />)

    const plusLink = screen.getByRole('link', { name: /subscribe to plus/i })
    const proLink = screen.getByRole('link', { name: /subscribe to pro/i })

    expect(plusLink).toHaveAttribute('href', '/login?next=%2Fplans&intent=subscribe')
    expect(proLink).toHaveAttribute('href', '/login?next=%2Fplans&intent=subscribe')
    expect(screen.queryByRole('button', { name: /subscribe to plus/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /subscribe to pro/i })).not.toBeInTheDocument()
  })

  it('shows "Most Popular" badge on Plus plan when not logged in', () => {
    renderWithProviders(<PlanCards plans={MOCK_PLANS} />)

    expect(screen.getByText('Most Popular')).toBeInTheDocument()
  })

  it('does not show "Most Popular" badge on Plus when Plus is current plan', () => {
    renderWithProviders(
      <PlanCards
        plans={MOCK_PLANS}
        membership={BASE_MEMBERSHIP}
      />,
    )

    expect(screen.queryByText('Most Popular')).not.toBeInTheDocument()
  })

  it('shows "Cancel anytime" text for non-current paid plans', () => {
    renderWithProviders(<PlanCards plans={MOCK_PLANS} />)

    const cancelTexts = screen.getAllByText('Cancel anytime')
    expect(cancelTexts.length).toBeGreaterThanOrEqual(1)
  })

  it('does not show "Cancel anytime" when plan is current', () => {
    renderWithProviders(
      <PlanCards
        plans={MOCK_PLANS}
        membership={BASE_MEMBERSHIP}
      />,
    )

    const cancelTexts = screen.getAllByText('Cancel anytime')
    expect(cancelTexts).toHaveLength(1)
  })

  it('shows annual savings percentage when yearly billing is selected', () => {
    renderWithProviders(<PlanCards plans={MOCK_PLANS} />)

    fireEvent.click(screen.getByRole('button', { name: 'Yearly' }))

    const savingsLabels = screen.getAllByText(/Save \d+%/)
    expect(savingsLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('does not show savings percentage when monthly billing is selected', () => {
    renderWithProviders(<PlanCards plans={MOCK_PLANS} />)

    expect(screen.queryByText(/Save \d+%/)).not.toBeInTheDocument()
  })

  it('does not divide by zero when a monthly plan is free', () => {
    const plans = {
      plus: MOCK_PLANS.plus!.map(sku =>
        sku.interval === 'monthly' ? { ...sku, price: { ...sku.price, amount: 0 } } : sku,
      ),
    }
    renderWithProviders(<PlanCards plans={plans} />)

    fireEvent.click(screen.getByRole('button', { name: 'Yearly' }))

    expect(screen.queryByText(/Save \d+%/)).not.toBeInTheDocument()
  })
})
