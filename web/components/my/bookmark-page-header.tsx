'use client'

import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { TitleRouteDropdown } from '@/components/shared/title-route-dropdown'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  bookmarkRouteConfigs,
  getBookmarkCrossLinks,
  type BookmarkRouteConfig,
  type BookmarkRouteKey,
} from '@/lib/bookmark-route-configs'

interface BookmarkPageHeaderProps {
  routeKey: BookmarkRouteKey
  /** Optional action button(s) rendered to the right of the heading row, e.g. AddSourceButton */
  actions?: React.ReactNode
}

export function BookmarkPageHeader({ routeKey, actions }: BookmarkPageHeaderProps) {
  const t = useTranslations()
  // Indexing by the BookmarkRouteKey union widens literal MessageKey fields to `string`;
  // recover the known-correct shape (each entry is validated by `satisfies` on the config data).
  const config = bookmarkRouteConfigs[routeKey] as BookmarkRouteConfig
  const crossLinks = getBookmarkCrossLinks(t, config.family, config.path)
  const title = t(config.title)
  const breadcrumbItems = [
    { name: t('extracted.my.bookmarkPageHeader.home_3a786953'), path: '/' },
    ...(config.breadcrumb.path !== config.path
      ? [{ name: t(config.breadcrumb.name), path: config.breadcrumb.path }]
      : []),
    { name: title, path: config.path },
  ]

  return (
    <div className='space-y-3'>
      <Breadcrumbs items={breadcrumbItems} />
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <h1
          data-pw='bookmark-page-heading'
          className='leading-none'
        >
          {crossLinks.length >= 2 ? (
            <TitleRouteDropdown
              label={title}
              items={crossLinks}
              dataPw='bookmark-title-dropdown-trigger'
            />
          ) : (
            <span className='text-2xl font-semibold'>{title}</span>
          )}
        </h1>
        {actions}
      </div>
      {config.description && (
        <p className='text-sm text-muted-foreground'>{t(config.description)}</p>
      )}
    </div>
  )
}
