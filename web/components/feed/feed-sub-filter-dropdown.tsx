'use client'

import { LinkSelectDropdown } from '@/components/shared/link-select-dropdown'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getFeedSubFilters, type FeedCategory } from '@/lib/feed-route-configs'

export function FeedSubFilterDropdown({
  category,
  activeFilterPath,
}: {
  category: FeedCategory
  activeFilterPath: string
}) {
  const t = useTranslations()
  const subFilters = getFeedSubFilters(category)
  if (subFilters.length <= 1) return null
  const activeSubFilter = subFilters.find(config => config.path === activeFilterPath)

  return (
    <LinkSelectDropdown
      label={
        activeSubFilter
          ? t(activeSubFilter.label)
          : t('extracted.feed.feedSubFilterDropdown.following_344b4271')
      }
      ariaLabel='Select feed filter'
      items={subFilters.map(config => ({
        label: t(config.label),
        href: config.path,
        active: config.path === activeFilterPath,
      }))}
    />
  )
}
