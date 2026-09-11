'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ContributionStatusResponseBody } from '@/types/api-responses/urls-onboarding-and-trends'
import { useRouter } from 'next/navigation'
import { useEmailVerificationRecovery } from '@/lib/email-verification-recovery-context'

interface ContributionGatedCtaProps {
  status: ContributionStatusResponseBody['contribution_status']
  admission?: ContributionStatusResponseBody['admission']
  actionNoun?: string
}

interface CtaConfig {
  title: string
  description: string
  primaryLabel: string
  primaryHref: string
  secondaryLabel?: string
  secondaryHref?: string
}

function getCtaConfig(
  status: ContributionStatusResponseBody['contribution_status'],
  admission: ContributionStatusResponseBody['admission'] | undefined,
  actionNoun: string,
  t: ReturnType<typeof useTranslations>,
): CtaConfig {
  if (status.reason === 'account_too_new') {
    return {
      title: t('extracted.posts.contributionGatedCta.almostThereJustAShortWait_3a01a0c2'),
      description: t('extracted.posts.contributionGatedCta.newAccountsHaveA7Day_36a2d008', {
        actionNoun,
      }),
      primaryLabel: t('extracted.posts.contributionGatedCta.viewPlans_a72e2bd3'),
      primaryHref: '/plans',
    }
  }

  if (status.reason === 'email_verification_required') {
    return {
      title: t('extracted.posts.contributionGatedCta.verifyYourEmailToActionnoun_9236694f', {
        actionNoun,
      }),
      description: t(
        'extracted.posts.contributionGatedCta.aVerifiedEmailAddressIsRequired_59d11183',
        { actionNoun },
      ),
      primaryLabel: t('extracted.posts.contributionGatedCta.verifyEmail_e89a77e7'),
      primaryHref: '/my/identity',
      secondaryLabel: t(
        'extracted.posts.contributionGatedCta.orUpgradeToSkipVerification_cb48ef3c',
      ),
      secondaryHref: '/plans',
    }
  }

  if (admission && !admission.allowed) {
    return {
      title: t('extracted.posts.contributionGatedCta.youCanTActionnounRightNow_736d6ea7', {
        actionNoun,
      }),
      description: t(
        'extracted.posts.contributionGatedCta.youHaveReachedTheCurrentContribution_b3fa428c',
      ),
      primaryLabel: t('extracted.posts.contributionGatedCta.viewPlans_a72e2bd3'),
      primaryHref: '/plans',
    }
  }

  return {
    title: t('extracted.posts.contributionGatedCta.youCanTActionnounRightNow_736d6ea7', {
      actionNoun,
    }),
    description: t('extracted.posts.contributionGatedCta.yourAccountIsCurrentlyUnableTo_fdc47ef8', {
      actionNoun,
    }),
    primaryLabel: t('extracted.posts.contributionGatedCta.viewPlans_a72e2bd3'),
    primaryHref: '/plans',
  }
}

export function ContributionGatedCta({ status, admission, actionNoun }: ContributionGatedCtaProps) {
  const t = useTranslations()
  const router = useRouter()
  const emailRecovery = useEmailVerificationRecovery()
  const resolvedActionNoun = actionNoun ?? t('extracted.posts.contributionGatedCta.post_72231043')
  const config = getCtaConfig(status, admission, resolvedActionNoun, t)

  return (
    <Card
      className='p-0'
      data-pw='contribution-gated-cta'
    >
      <CardHeader>
        <div className='flex items-center gap-2'>
          <Lock className='h-4 w-4 text-muted-foreground' />
          <CardTitle className='text-base'>{config.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='text-sm text-muted-foreground'>{config.description}</p>
        <div className='flex flex-col gap-2'>
          {status.reason === 'email_verification_required' ? (
            <Button
              onClick={() =>
                emailRecovery?.openEmailVerificationRecovery({ onVerified: () => router.refresh() })
              }
            >
              {config.primaryLabel}
            </Button>
          ) : (
            <Button
              asChild
              data-pw='contribution-gated-cta-primary'
            >
              <Link
                href={config.primaryHref}
                prefetch={false}
              >
                {config.primaryLabel}
              </Link>
            </Button>
          )}
          {config.secondaryHref && (
            <Link
              href={config.secondaryHref}
              prefetch={false}
              className='text-center text-sm text-muted-foreground underline-offset-4 hover:underline'
              data-pw='contribution-gated-cta-secondary'
            >
              {config.secondaryLabel}
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
