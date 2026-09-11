'use client'

/**
 * Post filters component
 * Horizontal scrollable filter chips for mobile-friendly filtering
 */

import { Suspense } from 'react'
import { ListFilters } from '@/components/shared/list-filters'
import { useTranslations } from '@/lib/i18n/use-translations'

interface PostFiltersProps {
  showSearch?: boolean
  showSort?: boolean
  sortOptions?: Array<{ label: string; value: string; description: string }>
  defaultSort?: string
  enableHashtagSearch?: boolean
  enableRelevanceSort?: boolean
}

export function PostFilters(props: PostFiltersProps) {
  return (
    <Suspense fallback={null}>
      <PostFiltersContent {...props} />
    </Suspense>
  )
}

// oxlint-disable-next-line react-doctor/no-many-boolean-props -- established component API
function PostFiltersContent({
  showSearch = true,
  showSort = true,
  sortOptions,
  defaultSort = 'new',
  enableHashtagSearch = true,
  enableRelevanceSort = true,
}: PostFiltersProps) {
  const t = useTranslations()
  const resolvedSortOptions = sortOptions ?? [
    {
      label: t('extracted.posts.postFilters.hot_0ec53894'),
      value: 'hot',
      description: t('extracted.posts.postFilters.sortByTrendingScore_f85080e3'),
    },
    {
      label: t('extracted.posts.postFilters.new_18fdd549'),
      value: 'new',
      description: t('extracted.posts.postFilters.sortByMostRecent_20464d27'),
    },
  ]
  const searchOnlySortOptions = enableRelevanceSort
    ? [
        {
          label: t('extracted.posts.postFilters.relevance_e2736174'),
          value: 'relevance',
          description: t('extracted.posts.postFilters.sortBySearchRelevance_ab2fd9fe'),
        },
      ]
    : undefined
  return (
    <ListFilters
      placeholder={t('extracted.posts.postFilters.searchByTextOrTopic_a76eda0f')}
      defaultSort={defaultSort}
      sortOptions={resolvedSortOptions}
      searchOnlySortOptions={searchOnlySortOptions}
      searchDefaultSort={enableRelevanceSort ? 'relevance' : undefined}
      showSearch={showSearch}
      showSort={showSort}
      enableHashtagSearch={enableHashtagSearch}
    />
  )
}
