export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { getPlans, getMembership } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { AboutVouchaAside } from '@/components/asides/about-voucha-aside'
import { createPageMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'
import { PlanCards } from '@/components/memberships/plan-cards'
import { PlanComparisonTable } from '@/components/memberships/plan-comparison-table'
import { PlanFAQ } from '@/components/memberships/plan-faq'
import { fallbackMembershipBenefitCatalog } from '@/components/memberships/fallback-benefit-catalog'
import type { SubscriptionMembership } from '@/types/api-responses'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getResolvedUiLocale } from '@/lib/i18n/get-resolved-ui-locale'
import { groupStripeMembershipProducts, toUiMembership } from '@/lib/memberships/catalog'

export const metadata: Metadata = createPageMetadata({
  title: 'Plans',
  description:
    'Choose the right Voucha plan. Free to join and explore. Paid plans unlock immediate publishing, more contribution capacity, and advanced community and research tools.',
  path: '/plans',
})

export default async function PlansPage() {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  const [plansResult, membershipResult, locale] = await Promise.all([
    getPlans().catch(() => null),
    currentUser ? getMembership().catch(() => null) : null,
    getResolvedUiLocale(),
  ])
  const plans = groupStripeMembershipProducts(plansResult?.products ?? [])
  const benefitCatalog = plansResult?.benefit_catalog ?? fallbackMembershipBenefitCatalog
  const membership: SubscriptionMembership | null | undefined = currentUser
    ? membershipResult?.membership
      ? toUiMembership(
          membershipResult.membership,
          plansResult?.products ?? [],
          membershipResult.management,
        )
      : null
    : undefined

  return (
    <PageWithAside
      aside={AboutVouchaAside}
      showFooter={false}
    >
      <div className='mx-auto max-w-4xl py-6'>
        <h1
          className='mb-2 text-3xl font-bold'
          data-pw='plans-page-heading'
        >
          {t('extracted.plans.page.plans_dfe8b2f0')}
        </h1>
        <p className='mb-8 text-muted-foreground'>
          {t('extracted.plans.page.freeToJoinAndExploreGo_8729d09a')}
        </p>
        <PlanCards
          benefitCatalog={benefitCatalog}
          plans={plans}
          membership={membership}
        />
        <div className='mt-12 space-y-10'>
          <PlanComparisonTable
            benefitCatalog={benefitCatalog}
            locale={locale}
            plans={plans}
            t={t}
          />
          <PlanFAQ t={t} />
        </div>
      </div>
    </PageWithAside>
  )
}
