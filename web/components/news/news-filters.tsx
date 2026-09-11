'use client'

import { ListFilters } from '@/components/shared/list-filters'
import { useTranslations } from '@/lib/i18n/use-translations'

export function NewsFilters() {
  const t = useTranslations()
  const newsSortOptions = [{ label: t('extracted.news.newsFilters.new_18fdd549'), value: 'new' }]
  return (
    <ListFilters
      placeholder={t('extracted.news.newsFilters.searchByTextOrTopic_a76eda0f')}
      searchLabel={t('extracted.news.newsFilters.searchNews_7477c17c')}
      defaultSort='new'
      sortOptions={newsSortOptions}
      showSort={false}
      enableHashtagSearch
    />
  )
}
