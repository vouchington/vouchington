'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { buildLoginHref } from '@/lib/auth/login-url'
import { cn } from '@/lib/utils'
import type {
  MembershipBenefitCatalog,
  MembershipPlanSku,
  SubscriptionMembership,
} from '@/types/api-responses'
import { BillingPortalButton } from './billing-portal-button'
import { CheckoutButton } from './checkout-button'
import { BILLING_MANAGEABLE_STATUSES, MOST_POPULAR_PLAN } from './plan-card-data'
import { PlanFeatureList } from './plan-feature-list'
import { presentCardFeatures } from './plan-benefit-presentation'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatMoney, monthlyEquivalent } from '@/lib/money'

export function PaidPlanCard({
  benefitCatalog = null,
  billingInterval,
  isCurrent,
  membership,
  planSlug,
  purchaseEnabled = false,
  savingsPct,
  sku,
}: {
  benefitCatalog?: MembershipBenefitCatalog | null
  billingInterval: 'monthly' | 'yearly'
  isCurrent: boolean
  /** undefined = signed-out, null = signed-in without subscription, value = active membership. */
  membership?: SubscriptionMembership | null
  planSlug: string
  purchaseEnabled?: boolean
  savingsPct: number | null
  sku: MembershipPlanSku
}) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const features =
    planSlug === 'plus' || planSlug === 'pro'
      ? presentCardFeatures(benefitCatalog, planSlug, t)
      : []
  const isMostPopular = planSlug === MOST_POPULAR_PLAN && !isCurrent
  const isSignedOut = membership === undefined
  const showBillingPortal =
    membership !== null &&
    membership !== undefined &&
    membership.plan === planSlug &&
    BILLING_MANAGEABLE_STATUSES.has(membership.status) &&
    membership.has_stripe_subscription

  return (
    <Card
      className={cn(
        'relative flex flex-col p-4',
        isMostPopular && 'border-primary ring-1 ring-primary',
      )}
    >
      <PlanStatusBadge
        isCurrent={isCurrent}
        isMostPopular={isMostPopular}
      />
      <h2 className='mb-2 text-xl font-semibold capitalize'>{planSlug}</h2>
      <div className='mb-4 flex items-baseline gap-2'>
        <p className='text-3xl font-bold'>
          {formatMoney(sku.price, uiLocale)}
          <span className='text-sm font-normal text-muted-foreground'>
            /
            {billingInterval === 'monthly'
              ? t('extracted.memberships.paidPlanCard.mo_f4a4ce5f')
              : t('extracted.memberships.paidPlanCard.yr_5ee26e7e')}
          </span>
        </p>
        {savingsPct !== null && (
          <span className='text-sm font-semibold text-emerald-600'>
            {t('extracted.memberships.paidPlanCard.savePct_4a65e352', { pct: savingsPct })}
          </span>
        )}
      </div>
      {billingInterval === 'yearly' && (
        <p className='mb-2 text-sm text-muted-foreground'>
          {t('extracted.memberships.paidPlanCard.priceMoBilledYearly_6d6b1ef6', {
            price: monthlyEquivalent(sku.price, uiLocale),
          })}
        </p>
      )}
      <PlanFeatureList features={features} />
      <div className='mt-auto'>
        {showBillingPortal ? (
          <BillingPortalButton />
        ) : isCurrent ? (
          <Button
            variant='outline'
            className='w-full'
            disabled
          >
            {t('extracted.memberships.paidPlanCard.currentPlan_5d856320')}
          </Button>
        ) : purchaseEnabled ? (
          <>
            {isSignedOut ? (
              <SignedOutSubscribeButton planSlug={planSlug} />
            ) : (
              <CheckoutButton
                planSlug={planSlug}
                productId={sku.id}
                planName={planSlug}
              />
            )}
            <p className='mt-2 text-center text-xs text-muted-foreground'>
              {t('extracted.memberships.paidPlanCard.cancelAnytime_0e043e9c')}
            </p>
          </>
        ) : null}
      </div>
    </Card>
  )
}

function SignedOutSubscribeButton({ planSlug }: { planSlug: string }) {
  const t = useTranslations()
  const loginHref = buildLoginHref({ intent: 'subscribe', next: '/plans' })

  if (planSlug !== 'plus' && planSlug !== 'pro') {
    throw new Error(`Unsupported paid plan slug: ${planSlug}`)
  }

  return planSlug === 'plus' ? (
    <Button
      asChild
      className='w-full'
    >
      <Link
        href={loginHref}
        prefetch={false}
        data-pw='subscribe-to-plus-button'
      >
        {t('extracted.memberships.paidPlanCard.subscribeToPlus_a2771bcb')}
      </Link>
    </Button>
  ) : (
    <Button
      asChild
      className='w-full'
    >
      <Link
        href={loginHref}
        prefetch={false}
        data-pw='subscribe-to-pro-button'
      >
        {t('extracted.memberships.paidPlanCard.subscribeToPro_340d78d1')}
      </Link>
    </Button>
  )
}

function PlanStatusBadge({
  isCurrent,
  isMostPopular,
}: {
  isCurrent: boolean
  isMostPopular: boolean
}) {
  const t = useTranslations()
  if (isCurrent) {
    return (
      <span className='absolute right-4 top-4 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground'>
        {t('extracted.memberships.paidPlanCard.currentPlan_5d856320')}
      </span>
    )
  }
  if (!isMostPopular) return null
  return (
    <span className='absolute right-4 top-4 rounded-full bg-amber-800 px-2 py-0.5 text-xs font-medium text-white'>
      {t('extracted.memberships.paidPlanCard.mostPopular_9e1006a4')}
    </span>
  )
}
