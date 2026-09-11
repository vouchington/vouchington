'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ButtonGroup } from '@/components/ui/button-group'
import { Button } from '@/components/ui/button'

const TABS = [
  { label: 'News', hrefBase: '/my/news-items' },
  { label: 'Podcasts', hrefBase: '/my/podcast-episodes' },
  { label: 'Videos', hrefBase: '/my/videos' },
] as const

export function RssBookmarkTypeFilter({ listType }: { listType: 'saved' | 'hidden' | 'viewed' }) {
  const pathname = usePathname()

  return (
    <ButtonGroup data-pw='rss-bookmark-type-filter'>
      {TABS.map(tab => {
        const href = `${tab.hrefBase}/${listType}`
        const isActive = pathname.startsWith(tab.hrefBase)
        return (
          <Button
            key={tab.hrefBase}
            variant={isActive ? 'default' : 'outline'}
            size='sm'
            asChild
          >
            <Link
              href={href}
              prefetch={false}
            >
              {tab.label}
            </Link>
          </Button>
        )
      })}
    </ButtonGroup>
  )
}
