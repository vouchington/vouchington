import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { seedMessages } from '@/lib/i18n/use-translations'
import type { SubscriptionMembership } from '@/types/api-responses'
import esMessages from '@ts-shared/ui-messages/messages/es'
import { MembershipStatus } from '../membership-status'

const membership: SubscriptionMembership = {
  __entity_type: 'membership',
  id: 'membership-1',
  user_id: 'user-1',
  plan: 'plus',
  status: 'active',
  started_at: '2026-01-01T12:00:00.000Z',
  expires_at: '2026-02-02T12:00:00.000Z',
  has_stripe_subscription: false,
  granted_by_id: null,
  cancelled_at: null,
  expired_at: null,
  past_due_at: null,
  paused_at: null,
  cancel_at_period_end: true,
  latest_change_id: null,
  created_at: '2026-01-01T12:00:00.000Z',
  updated_at: '2026-01-01T12:00:00.000Z',
  sku: {
    id: 'sku-1',
    plan: 'plus',
    price: { amount: 500, currency: 'usd' },
    interval: 'monthly',
    stripe_price_id: 'price-1',
    retired_at: null,
  },
}

describe('MembershipStatus', () => {
  it('formats prices and dates with the active UI locale', () => {
    seedMessages('es', esMessages)

    render(
      <UiLocaleProvider uiLocale='es'>
        <MembershipStatus membership={membership} />
      </UiLocaleProvider>,
    )

    expect(screen.getByText(/5,00 US\$\/mes/)).toBeInTheDocument()
    expect(screen.getByText(/1 de enero de 2026/)).toBeInTheDocument()
    expect(screen.getByText(/2 de febrero de 2026/)).toBeInTheDocument()
    expect(screen.getByText(/Se renueva: 2 de febrero de 2026/)).toBeInTheDocument()
    expect(screen.queryByText(/\$5\.00/)).not.toBeInTheDocument()
  })

  it('labels finite administrator grant dates as expiry dates', () => {
    render(
      <UiLocaleProvider uiLocale='en'>
        <MembershipStatus
          membership={{
            ...membership,
            granted_by_id: 'admin-1',
          }}
        />
      </UiLocaleProvider>,
    )

    expect(screen.getByText(/Expires: February 2, 2026/)).toBeInTheDocument()
    expect(screen.queryByText(/Renews:/)).not.toBeInTheDocument()
  })

  it('does not invent billing details for a provider-neutral grant', () => {
    render(
      <UiLocaleProvider uiLocale='en'>
        <MembershipStatus
          membership={{
            ...membership,
            granted_by_id: 'admin-1',
            sku: { ...membership.sku, price: null, stripe_price_id: null },
          }}
        />
      </UiLocaleProvider>,
    )

    expect(screen.queryByText(/\/mo|\/yr/)).not.toBeInTheDocument()
  })

  it.each([
    ['apple_app_store', 'apple_subscriptions', 'https://apps.apple.com/account/subscriptions'],
    [
      'google_play',
      'google_play_subscriptions',
      'https://play.google.com/store/account/subscriptions',
    ],
    [
      'microsoft_store',
      'microsoft_services_subscriptions',
      'https://account.microsoft.com/services',
    ],
  ] as const)(
    'links %s members to their provider-owned management destination',
    (provider, destination, href) => {
      render(
        <UiLocaleProvider uiLocale='en'>
          <MembershipStatus
            membership={membership}
            management={{ provider, destination }}
          />
        </UiLocaleProvider>,
      )

      expect(screen.getByRole('link', { name: 'Manage Billing' })).toHaveAttribute('href', href)
    },
  )
})
