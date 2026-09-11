'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { MembershipBenefitCatalog, SubscriptionMembership } from '@/types/api-responses'
import { PlanFeatureList } from './plan-feature-list'
import { presentCardFeatures } from './plan-benefit-presentation'
import { useTranslations } from '@/lib/i18n/use-translations'

export function FreePlanCard({
  benefitCatalog = null,
  freeCurrent,
  membership,
}: {
  benefitCatalog?: MembershipBenefitCatalog | null
  freeCurrent: boolean
  membership?: SubscriptionMembership | null
}) {
  const t = useTranslations()
  const features = presentCardFeatures(benefitCatalog, 'free', t)
  return (
    <Card className='relative flex flex-col p-4'>
      {freeCurrent && (
        <span className='absolute right-4 top-4 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground'>
          {t('extracted.memberships.freePlanCard.currentPlan_5d856320')}
        </span>
      )}
      <h2 className='mb-2 text-xl font-semibold'>
        {t('extracted.memberships.freePlanCard.free_f411a1fb')}
      </h2>
      <p className='mb-4 text-3xl font-bold'>
        $0
        <span className='text-sm font-normal text-muted-foreground'>
          {t('extracted.memberships.freePlanCard.mo_dcc95433')}
        </span>
      </p>
      <PlanFeatureList features={features} />
      {freeCurrent ? (
        <Button
          variant='outline'
          className='w-full'
          disabled
        >
          {t('extracted.memberships.freePlanCard.currentPlan_5d856320')}
        </Button>
      ) : membership === undefined ? (
        <Button
          asChild
          variant='default'
          className='w-full'
        >
          <Link
            href='/login'
            prefetch={false}
            data-pw='free-plan-get-started-link'
          >
            {t('extracted.memberships.freePlanCard.getStarted_983f3110')}
          </Link>
        </Button>
      ) : null}
    </Card>
  )
}
