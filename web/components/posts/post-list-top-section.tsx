'use client'

import type { ReactNode } from 'react'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { TitleRouteDropdown } from '@/components/shared/title-route-dropdown'
import { postRouteConfigs, type PostRouteConfig } from '@/lib/route-configs'
import { useTranslations } from '@/lib/i18n/use-translations'

const EMPTY_ROLES: readonly string[] = []

export function PostListTopSection({
  config,
  filters,
  viewToggle,
  isAuthenticated,
  userRoles = EMPTY_ROLES,
}: {
  config: PostRouteConfig
  filters: ReactNode
  viewToggle: ReactNode
  isAuthenticated: boolean
  userRoles?: readonly string[]
}) {
  const t = useTranslations()
  const breadcrumbItems = buildBreadcrumbsForPath(`/${config.pluralPath}`, {
    isAuthenticated,
    userRoles,
    tail: [{ name: t(config.title), path: `/${config.pluralPath}` }],
  })
  const activeLabel =
    config.pluralPath === 'posts'
      ? t('extracted.posts.postListTopSection.all_a52ace42')
      : t(config.title)

  return (
    <div
      className='space-y-4'
      data-pw='post-list-top-section'
    >
      <Breadcrumbs items={breadcrumbItems} />

      <h1 className='leading-none'>
        <TitleRouteDropdown
          label={activeLabel}
          dataPw='post-type-title-dropdown-trigger'
          items={Object.values(postRouteConfigs).map(routeConfig => ({
            label:
              routeConfig.pluralPath === 'posts'
                ? t('extracted.posts.postListTopSection.all_a52ace42')
                : t(routeConfig.title),
            href: `/${routeConfig.pluralPath}`,
            active: routeConfig.pluralPath === config.pluralPath,
          }))}
        />
      </h1>

      <div className='flex flex-wrap items-start gap-2 sm:items-center'>
        {filters}
        {viewToggle}
      </div>
    </div>
  )
}
