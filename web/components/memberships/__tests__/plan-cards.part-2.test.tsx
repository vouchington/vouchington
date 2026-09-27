import {
  BASE_MEMBERSHIP,
  MOCK_PLANS,
  renderWithProviders,
} from '@/test-helpers/components/memberships/plan-cards.mock-support'

import { describe, expect, it } from 'vitest'

import { screen } from '@testing-library/react'

import { PlanCards } from '../plan-cards'

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
