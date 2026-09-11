'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { X, UserPlus, Globe } from 'lucide-react'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth/context'
import { useTranslations } from '@/lib/i18n/use-translations'

const REFERRAL_CTAS = [
  {
    href: '/login',
    labelKey: 'extracted.components.referralCtaAside.signUp_5e2b8e96',
    descriptionKey: 'extracted.components.referralCtaAside.createYourFreeAccount_627c03c2',
    icon: UserPlus,
  },
  {
    href: '/referral-programs',
    labelKey: 'extracted.components.referralCtaAside.shareAReferralLink_d96fe10d',
    descriptionKey: 'extracted.components.referralCtaAside.shareLinksAndEarnRewards_611103a1',
    icon: EntityActionIcons.referralLinkCreate,
  },
  {
    href: '/discussions',
    labelKey: 'extracted.components.referralCtaAside.shareADataPointOrReview_01ac7a87',
    descriptionKey: 'extracted.components.referralCtaAside.contributeToTheCommunity_8b485b74',
    icon: EntityActionIcons.shareDataPoint,
  },
  {
    href: '/my/landing-pages',
    labelKey: 'extracted.components.referralCtaAside.setUpYourLandingPage_b3470134',
    descriptionKey: 'extracted.components.referralCtaAside.buildYourReferralProfileToEarn_1c778429',
    icon: Globe,
  },
] as const

export function ReferralCtaAside() {
  return (
    <Suspense fallback={null}>
      <ReferralCtaAsideContent />
    </Suspense>
  )
}

function ReferralCtaAsideContent() {
  const t = useTranslations()
  const { isAuthenticated } = useAuth()
  const searchParams = useSearchParams()
  const [dismissed, setDismissed] = useState(false)

  if (isAuthenticated || !searchParams.has('referrer') || dismissed) return null

  function handleDismiss() {
    setDismissed(true)
  }

  return (
    <Card className='p-4'>
      <div className='mb-3 flex items-center justify-between'>
        <h3 className='text-sm font-semibold'>
          {t('extracted.components.referralCtaAside.getStarted_61e8d44a')}
        </h3>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='-my-2 -mr-2 h-11 w-11 sm:my-0 sm:mr-0 sm:h-6 sm:w-6'
          aria-label={t('extracted.components.referralCtaAside.dismiss_48845bff')}
          onClick={handleDismiss}
        >
          <X className='h-3.5 w-3.5' />
        </Button>
      </div>
      <ul className='space-y-1'>
        {REFERRAL_CTAS.map(({ href, labelKey, descriptionKey, icon: Icon }) => (
          <li key={href}>
            <Button
              asChild
              variant='ghost'
              className='h-auto w-full justify-start px-2 py-2'
            >
              <Link
                href={href}
                prefetch={false}
                onClick={handleDismiss}
              >
                <Icon className='mr-2 h-4 w-4 shrink-0 text-primary' />
                <div className='text-left'>
                  <p className='text-sm font-medium'>{t(labelKey)}</p>
                  <p className='text-xs text-muted-foreground'>{t(descriptionKey)}</p>
                </div>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
