'use client'

import Link from 'next/link'
import { formatCompactNumber } from '@ts-shared/utils'
import type { TopCommunitiesViewModel } from '@/lib/view-models/homepage-view-models'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TopCommunitiesProps {
  data: TopCommunitiesViewModel | null
}

export function TopCommunities({ data }: TopCommunitiesProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  if (!data) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('extracted.home.topCommunities.unableToLoadCommunities_616ee8fb')}
      </p>
    )
  }

  if (data.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('extracted.home.topCommunities.noCommunitiesYet_c35deb19')}
      </p>
    )
  }

  return (
    <div
      className='space-y-3'
      data-pw='top-communities'
    >
      <div className='divide-y rounded-md bg-card shadow-sm'>
        {data.map(community => {
          return (
            <Link
              key={community.id}
              href={community.href}
              prefetch={false}
              className='flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/50'
            >
              <span className='truncate font-medium'>{community.name}</span>
              {community.memberCount != null && (
                <span className='shrink-0 text-xs text-muted-foreground'>
                  {t('extracted.home.topCommunities.countMembers_201eb3d9', {
                    count: formatCompactNumber(community.memberCount, uiLocale),
                  })}
                </span>
              )}
            </Link>
          )
        })}
      </div>
      <div className='text-sm'>
        <Link
          href='/communities'
          prefetch={false}
          className='text-primary hover:underline'
        >
          {t('extracted.home.topCommunities.browseAllCommunities_c4aefba0')}
        </Link>
      </div>
    </div>
  )
}
