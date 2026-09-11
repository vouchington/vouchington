'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createBillingPortalSession } from '@/lib/api/client'
import type {
  EffectiveMembership,
  MembershipProviderManagement,
  SubscriptionMembership,
} from '@/types/api-responses'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatMoney } from '@/lib/money'

interface MembershipStatusProps {
  membership: SubscriptionMembership | EffectiveMembership
  management?: MembershipProviderManagement | null
}

const MANAGEMENT_HREFS = {
  apple_subscriptions: 'https://apps.apple.com/account/subscriptions',
  google_play_subscriptions: 'https://play.google.com/store/account/subscriptions',
  microsoft_services_subscriptions: 'https://account.microsoft.com/services',
} as const

function formatDate(dateString: string, locale: string): string {
  return new Date(dateString).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function MembershipStatus({ membership, management = null }: MembershipStatusProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const [portalLoading, setPortalLoading] = useState(false)

  async function handleManageBilling() {
    setPortalLoading(true)
    try {
      const { portal_session } = await createBillingPortalSession('/my/membership')
      window.location.href = portal_session.url
    } finally {
      setPortalLoading(false)
    }
  }

  const managementHref =
    management && management.destination !== 'billing_portal'
      ? MANAGEMENT_HREFS[management.destination]
      : null

  return (
    <Card className='space-y-4 p-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h2
            className='text-lg font-semibold capitalize'
            data-pw='membership-plan-name'
          >
            {t('extracted.memberships.membershipStatus.planPlan_47f43644', {
              plan: membership.plan,
            })}
          </h2>
          {'sku' in membership && membership.sku.price && (
            <p className='text-sm text-muted-foreground'>
              {formatMoney(membership.sku.price, uiLocale)}/
              {membership.sku.interval === 'monthly'
                ? t('extracted.memberships.membershipStatus.mo_f4a4ce5f')
                : t('extracted.memberships.membershipStatus.yr_5ee26e7e')}
            </p>
          )}
        </div>
        <Badge
          data-pw='membership-status-badge'
          variant='outline'
          className={`rounded-full ${
            membership.status === 'active'
              ? 'border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-900 dark:text-green-200'
              : 'border-yellow-200 bg-yellow-100 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
          }`}
        >
          {membership.status}
        </Badge>
      </div>

      <div className='space-y-1 text-sm text-muted-foreground'>
        <p>
          {t('extracted.memberships.membershipStatus.startedDate_c2966ee3', {
            date: formatDate(membership.started_at, uiLocale),
          })}
        </p>
        {membership.expires_at && (
          <p>
            {t(
              membership.granted_by_id
                ? 'extracted.memberships.membershipStatus.expiresDate_5c6d7e8f'
                : 'extracted.memberships.membershipStatus.renewsDate_4bd0431f',
              {
                date: formatDate(membership.expires_at, uiLocale),
              },
            )}
          </p>
        )}
        {membership.cancel_at_period_end && (
          <p className='text-yellow-600'>
            {t('extracted.memberships.membershipStatus.cancelsAtEndOfPeriod_6e1151a5')}
          </p>
        )}
        {membership.granted_by_id && (
          <p>{t('extracted.memberships.membershipStatus.grantedByAdmin_d1cbc696')}</p>
        )}
      </div>

      <div className='flex gap-2'>
        {managementHref ? (
          <Button
            asChild
            variant='outline'
          >
            <a
              href={managementHref}
              rel='noopener noreferrer'
              target='_blank'
            >
              {t('extracted.memberships.membershipStatus.manageBilling_6d3a16f5')}
            </a>
          </Button>
        ) : management?.provider === 'stripe' ||
          ('has_stripe_subscription' in membership && membership.has_stripe_subscription) ? (
          <Button
            variant='outline'
            loading={portalLoading}
            disabled={portalLoading}
            onClick={handleManageBilling}
          >
            {portalLoading
              ? t('extracted.memberships.membershipStatus.loading_47d2a515')
              : t('extracted.memberships.membershipStatus.manageBilling_6d3a16f5')}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
