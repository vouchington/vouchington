'use client'

import Link from 'next/link'
import type { TopReferralProgramsViewModel } from '@/lib/view-models/homepage-view-models'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TopReferralProgramsProps {
  data: TopReferralProgramsViewModel | null
}

export function TopReferralPrograms({ data }: TopReferralProgramsProps) {
  const t = useTranslations()
  if (!data) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('extracted.home.topReferralPrograms.unableToLoadReferralPrograms_0fb55405')}
      </p>
    )
  }

  if (data.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('extracted.home.topReferralPrograms.noReferralProgramsYet_6867fc79')}
      </p>
    )
  }

  return (
    <div
      className='space-y-3'
      data-pw='top-referral-programs'
    >
      <div className='divide-y rounded-md bg-card shadow-sm'>
        {data.map(topic => {
          return (
            <Link
              key={topic.id}
              href={topic.href}
              prefetch={false}
              className='flex items-center gap-3 p-4 transition-colors hover:bg-muted/50'
            >
              <span className='truncate font-medium'>{topic.name}</span>
            </Link>
          )
        })}
      </div>
      <div className='text-sm'>
        <Link
          href='/referral-programs'
          prefetch={false}
          className='text-primary hover:underline'
        >
          {t('extracted.home.topReferralPrograms.browseAllReferralPrograms_bb071377')}
        </Link>
      </div>
    </div>
  )
}
