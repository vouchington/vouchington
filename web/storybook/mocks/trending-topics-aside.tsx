'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { useTranslations } from '@/lib/i18n/use-translations'

const trendingTopics = [
  { href: '/card/sapphire-reserve', name: 'Sapphire Reserve' },
  { href: '/topic/open-banking', name: 'Open Banking' },
  { href: '/referral-program/amex-referrals', name: 'Amex Referrals' },
  { href: '/rewards-program/ultimate-rewards', name: 'Ultimate Rewards' },
  { href: '/bank-account/high-yield-savings', name: 'High Yield Savings' },
]

/**
 * Storybook stand-in for the async server aside. The real export awaits getTrendingTopics(),
 * which reaches server API helpers, and React cannot render that async component in the client runner.
 */
export function TrendingTopicsAside() {
  const t = useTranslations()
  return (
    <Card
      className='p-4'
      data-pw='trending-topics-aside'
    >
      <h3
        data-pw='trending-topics-aside-heading'
        className='mb-2 text-sm font-semibold'
      >
        {t('extracted.asides.trendingTopicsAside.trendingTopics_e84e730e')}
      </h3>
      <ul className='space-y-1.5'>
        {trendingTopics.map(topic => (
          <li key={topic.href}>
            <Link
              href={topic.href}
              prefetch={false}
              className='text-sm text-primary hover:underline'
            >
              {topic.name}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href='/topics'
        prefetch={false}
        className='mt-3 block text-xs text-muted-foreground hover:underline'
      >
        {t('extracted.asides.trendingTopicsAside.browseAllTopics_44e4ba00')}
      </Link>
    </Card>
  )
}
