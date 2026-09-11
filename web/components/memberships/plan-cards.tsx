'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type {
  MembershipBenefitCatalog,
  MembershipPlanSku,
  SubscriptionMembership,
} from '@/types/api-responses'
import { ENTITLED_STATUSES, PLAN_ORDER } from './plan-card-data'
import { FreePlanCard } from './free-plan-card'
import { PaidPlanCard } from './paid-plan-card'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags'

const MONTHS_PER_YEAR_NUMBER = 12
const PERCENT_SCALE_NUMBER = 100
const ROUNDING_DIVISOR_NUMBER = 2
const ZERO_NUMBER = 0
const MONTHS_PER_YEAR = BigInt(MONTHS_PER_YEAR_NUMBER)
const PERCENT_SCALE = BigInt(PERCENT_SCALE_NUMBER)
const ROUNDING_DIVISOR = BigInt(ROUNDING_DIVISOR_NUMBER)
const ZERO = BigInt(ZERO_NUMBER)

interface PlanCardsProps {
  benefitCatalog?: MembershipBenefitCatalog | null
  plans: Record<string, MembershipPlanSku[]>
  membership?: SubscriptionMembership | null
}

export function PlanCards({ benefitCatalog = null, plans, membership }: PlanCardsProps) {
  const t = useTranslations()
  const featureFlags = useFeatureFlags()
  const purchaseEnabled =
    featureFlags.memberships === true && featureFlags.membershipStripeBilling === true
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly')

  function isCurrentPlan(planSlug: string): boolean {
    if (membership === undefined) return false
    if (planSlug === 'free') {
      return membership === null || !ENTITLED_STATUSES.has(membership.status)
    }
    return (
      membership !== null &&
      membership?.plan === planSlug &&
      ENTITLED_STATUSES.has(membership.status)
    )
  }

  function getAnnualSavingsPct(skus: MembershipPlanSku[]): number | null {
    if (billingInterval !== 'yearly') return null
    const monthly = skus.find(s => s.interval === 'monthly')
    const yearly = skus.find(s => s.interval === 'yearly')
    if (!monthly || !yearly || monthly.price.currency !== yearly.price.currency) return null
    const fullYear = BigInt(monthly.price.amount) * MONTHS_PER_YEAR
    if (fullYear === ZERO) return null
    const savings = fullYear - BigInt(yearly.price.amount)
    const pct = Number((savings * PERCENT_SCALE + fullYear / ROUNDING_DIVISOR) / fullYear)
    return pct > 0 ? pct : null
  }

  const freeCurrent = isCurrentPlan('free')

  return (
    <div>
      <div className='mb-8 rounded-lg border bg-muted/50 p-4 text-sm'>
        <p className='text-muted-foreground'>
          <strong className='text-foreground'>
            {t('extracted.memberships.planCards.paidMembersContributeImmediately_3dfc3a37')}
          </strong>{' '}
          {t('extracted.memberships.planCards.freeAccountsHaveA7Day_e3bb0dab')}
        </p>
      </div>

      <div className='mb-6 flex justify-center gap-2'>
        <Button
          variant={billingInterval === 'monthly' ? 'default' : 'outline'}
          size='sm'
          onClick={() => setBillingInterval('monthly')}
          data-pw='plan-billing-monthly-button'
        >
          {t('extracted.memberships.planCards.monthly_9b11f6b7')}
        </Button>
        <Button
          variant={billingInterval === 'yearly' ? 'default' : 'outline'}
          size='sm'
          onClick={() => setBillingInterval('yearly')}
          data-pw='plan-billing-yearly-button'
        >
          {t('extracted.memberships.planCards.yearly_6e69b59e')}
        </Button>
      </div>

      <div className='grid gap-6 md:grid-cols-3'>
        <FreePlanCard
          benefitCatalog={benefitCatalog}
          freeCurrent={freeCurrent}
          membership={membership}
        />

        {PLAN_ORDER.map(planSlug => {
          const skus = plans[planSlug]
          if (!skus) return null
          const sku = skus.find(s => s.interval === billingInterval)
          if (!sku) return null

          const isCurrent = isCurrentPlan(planSlug)
          const savingsPct = getAnnualSavingsPct(skus)

          return (
            <PaidPlanCard
              benefitCatalog={benefitCatalog}
              key={sku.id}
              billingInterval={billingInterval}
              isCurrent={isCurrent}
              membership={membership}
              planSlug={planSlug}
              purchaseEnabled={purchaseEnabled}
              savingsPct={savingsPct}
              sku={sku}
            />
          )
        })}
      </div>
    </div>
  )
}
