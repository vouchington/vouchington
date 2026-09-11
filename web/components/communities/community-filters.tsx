'use client'

/**
 * Community explore filters: sort by most members or name A-Z, plus text search
 */

import { ListFilters } from '@/components/shared/list-filters'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CommunityFilters() {
  const t = useTranslations()
  const sortOptions = [
    { label: t('extracted.communities.communityFilters.mostMembers_e7693c16'), value: 'members' },
    { label: t('extracted.communities.communityFilters.nameAZ_cc664106'), value: 'name' },
  ]
  return (
    <ListFilters
      placeholder={t('extracted.communities.communityFilters.searchByTextOrTopic_a76eda0f')}
      defaultSort='members'
      sortOptions={sortOptions}
      enableHashtagSearch
      searchLabel={t(
        'extracted.communities.communityFilters.searchCommunitiesByTextOrTopic_903c1b12',
      )}
    />
  )
}
