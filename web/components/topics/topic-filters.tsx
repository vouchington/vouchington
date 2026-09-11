'use client'

/**
 * Topic filters component
 * Horizontal scrollable filter chips for mobile-friendly filtering
 */

import { ListFilters } from '@/components/shared/list-filters'
import type { TopicTypes } from '@/types/topics'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TopicFiltersProps {
  allowedTypes?: TopicTypes[] // If specified, only show these types
  showSearch?: boolean
}

export function TopicFilters({
  allowedTypes: _allowedTypes,
  showSearch = true,
}: TopicFiltersProps) {
  const t = useTranslations()
  const topicSortOptions = [
    { label: t('extracted.topics.topicFilters.new_18fdd549'), value: 'new' },
    { label: t('extracted.topics.topicFilters.best_c47d21c6'), value: 'best' },
  ]
  const topicSearchOnlySortOptions = [
    { label: t('extracted.topics.topicFilters.relevance_e2736174'), value: 'relevance' },
  ]
  return (
    <ListFilters
      placeholder={t('extracted.topics.topicFilters.searchTopics_c9b252c2')}
      defaultSort='new'
      sortOptions={topicSortOptions}
      searchOnlySortOptions={topicSearchOnlySortOptions}
      searchDefaultSort='relevance'
      showSearch={showSearch}
    />
  )
}
