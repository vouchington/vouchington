'use client'

import Link from 'next/link'
import { AsideAccordion } from '@/components/asides/aside-accordion'
import { communityHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Community {
  id: string
  slug: string
  name: string
}

export function PopularCommunitiesAsideContent({ communities }: { communities: Community[] }) {
  const t = useTranslations()
  return (
    <AsideAccordion
      title={t('extracted.asides.popularCommunitiesAsideContent.yourCommunities_b7e36bbe')}
      data-pw='aside-accordion-communities'
    >
      <ul className='space-y-1.5'>
        {communities.map(community => (
          <li key={community.id}>
            <Link
              href={communityHref(community)}
              prefetch={false}
              className='inline-flex min-h-6 items-center text-sm text-primary hover:underline'
            >
              {community.name}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href='/communities'
        prefetch={false}
        className='mt-3 inline-flex min-h-6 items-center text-xs text-muted-foreground hover:underline'
        data-pw='popular-communities-browse-link'
      >
        {t('extracted.asides.popularCommunitiesAsideContent.browseAllCommunities_c4aefba0')}
      </Link>
    </AsideAccordion>
  )
}
