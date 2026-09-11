'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { domainHref } from '@/lib/links/entity-href'
import { type TrustTier, getTrustTier, getTrustLabel } from '@ts-shared/utils/trust-tier'
import { useTranslations } from '@/lib/i18n/use-translations'

function getTrustColor(tier: TrustTier): string {
  switch (tier) {
    case 'trusted': {
      return 'text-emerald-700 dark:text-emerald-400'
    }
    case 'neutral': {
      return 'text-amber-700 dark:text-amber-400'
    }
    case 'distrusted': {
      return 'text-rose-700 dark:text-rose-400'
    }
    case 'unrated': {
      return 'text-muted-foreground'
    }
  }
}

function getTrustTooltip(tier: TrustTier, t: ReturnType<typeof useTranslations>): string {
  switch (tier) {
    case 'trusted': {
      return t('extracted.domains.domainTrustBadge.trusted3NetVotesAnd5PositiveVotes_48d9392f')
    }
    case 'neutral': {
      return t(
        'extracted.domains.domainTrustBadge.neutralBetweenTrustedAndDistrustedThresholds_10b02a39',
      )
    }
    case 'distrusted': {
      return t('extracted.domains.domainTrustBadge.distrusted3OrFewerNetVotes_d8aa8135')
    }
    case 'unrated': {
      return t('extracted.domains.domainTrustBadge.unratedNoVotesYet_3213d916')
    }
  }
}

function getTrustBgColor(tier: TrustTier): string {
  switch (tier) {
    case 'trusted': {
      return 'bg-emerald-100 dark:bg-emerald-950'
    }
    case 'neutral': {
      return 'bg-amber-100 dark:bg-amber-950'
    }
    case 'distrusted': {
      return 'bg-rose-100 dark:bg-rose-950'
    }
    case 'unrated': {
      return 'bg-muted'
    }
  }
}

interface DomainTrustBadgeProps {
  scoreNet: number
  countUp: number
  countDown: number
  hostname?: string
  size?: 'sm' | 'xs'
  href?: string
}

export function DomainTrustBadge({
  scoreNet,
  countUp,
  countDown,
  hostname,
  size = 'sm',
  href,
}: DomainTrustBadgeProps) {
  const t = useTranslations()
  const tier = getTrustTier(scoreNet, countUp, countDown)
  const color = getTrustColor(tier)
  const bgColor = getTrustBgColor(tier)
  const label = getTrustLabel(tier)
  const dotSize = size === 'xs' ? 'h-1.5 w-1.5' : 'h-2 w-2'
  const textSize = size === 'xs' ? 'text-xs' : 'text-sm'
  const dotColorMap = {
    trusted: 'bg-emerald-700 dark:bg-emerald-400',
    neutral: 'bg-amber-700 dark:bg-amber-400',
    distrusted: 'bg-rose-700 dark:bg-rose-400',
    unrated: 'bg-muted-foreground',
  } as const
  const dotColor = dotColorMap[tier]

  const badge = (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${bgColor} ${textSize}`}
      title={getTrustTooltip(tier, t)}
    >
      <span className={`inline-block rounded-full ${dotSize} ${dotColor}`} />
      <span className={color}>{label}</span>
    </span>
  )

  const badgeHref = href ?? (hostname ? domainHref(hostname) : null)

  const trigger = badgeHref ? (
    <HoverCardTrigger asChild>
      <Link
        href={badgeHref}
        prefetch={false}
        className='hover:opacity-80'
      >
        {badge}
      </Link>
    </HoverCardTrigger>
  ) : (
    <HoverCardTrigger asChild>
      <Button
        variant='ghost'
        type='button'
        className='h-auto p-0 cursor-default'
        aria-label={t('extracted.domains.domainTrustBadge.labelTrustBadge_63af7352', { label })}
      >
        {badge}
      </Button>
    </HoverCardTrigger>
  )

  return (
    <HoverCard>
      {trigger}
      <HoverCardContent className='w-64'>
        <div className='text-sm'>
          <p className='font-semibold'>
            {t('extracted.domains.domainTrustBadge.labelDomain_d2ea6faa', { label })}
          </p>
          <p>{t('extracted.votes.semanticVote.positiveVotes', { count: countUp })}</p>
          <p>{t('extracted.votes.semanticVote.negativeVotes', { count: countDown })}</p>
          <p className='text-muted-foreground'>
            {t('extracted.domains.domainTrustBadge.totalvotesTotalVotes_d4499ddd', {
              totalVotes: countUp + countDown,
            })}
          </p>
          <p className='mt-2 text-xs text-muted-foreground'>
            {t('extracted.domains.domainTrustBadge.trustIsBasedOnCommunityVotes_694635e9')}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
