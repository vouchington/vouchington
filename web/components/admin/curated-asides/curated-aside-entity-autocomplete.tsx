'use client'

import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { fetchCommunities } from '@/lib/api/client/community-search'
import { searchRssFeedsClient } from '@/lib/api/client/rss-feeds'
import { fetchTopics } from '@/lib/api/client/topics'
import type { CuratedAsideType } from '@/types/api-responses/curated-aside-items'
import type { ViewRssFeed } from '@/types/rss-feeds'
import type { Topic } from '@/types/topics'
import type { CommunitiesSearchResponseBody } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

type Community = CommunitiesSearchResponseBody['communities'][string]

type AutocompleteItem =
  | { type: 'topic'; id: string; label: string; subtitle: string }
  | { type: 'source'; id: string; label: string; subtitle: string }
  | { type: 'community'; id: string; label: string; subtitle: string }

interface CuratedAsideEntityAutocompleteProps {
  asideType: CuratedAsideType
  disabled?: boolean
  onSelect: (item: AutocompleteItem) => void
}

export function CuratedAsideEntityAutocomplete({
  asideType,
  disabled = false,
  onSelect,
}: CuratedAsideEntityAutocompleteProps) {
  const t = useTranslations()
  return (
    <EntityAutocomplete<AutocompleteItem>
      key={asideType}
      search={(query, signal) => searchEntities(asideType, query, signal)}
      getKey={item => item.id}
      getItemValue={item => item.label}
      renderItem={item => (
        <span className='flex min-w-0 flex-col'>
          <span className='truncate font-medium'>{item.label}</span>
          <span className='truncate text-xs text-muted-foreground'>{item.subtitle}</span>
        </span>
      )}
      onSelect={(item, helpers) => {
        helpers.setQuery(item.label)
        onSelect(item)
      }}
      placeholder={placeholderFor(asideType, t)}
      ariaLabel={ariaLabelFor(asideType, t)}
      emptyText={query =>
        query.trim()
          ? t('extracted.curatedAsides.curatedAsideEntityAutocomplete.noMatchesFound_eb82569d')
          : t('extracted.curatedAsides.curatedAsideEntityAutocomplete.startTypingToSearch_320a30bb')
      }
      minQueryLength={2}
      minQueryLengthText={t(
        'extracted.curatedAsides.curatedAsideEntityAutocomplete.typeAtLeast2Characters_f7eaa8cd',
      )}
      disabled={disabled}
      clearResultsOnSelect
      dataPw={{
        input: 'curated-aside-entity-autocomplete',
        item: 'curated-aside-entity-option',
      }}
    />
  )
}

async function searchEntities(
  asideType: CuratedAsideType,
  query: string,
  signal: AbortSignal,
): Promise<AutocompleteItem[]> {
  if (asideType === 'topic') {
    const data = await fetchTopics({ q: query, limit: 10, signal })
    return data.results.flatMap(result => {
      const topic = data.topics[result.id]
      if (!topic) return []
      return [
        {
          type: 'topic',
          id: topic.id,
          label: topic.name,
          subtitle: topic.slug,
        },
      ]
    })
  }

  if (asideType === 'source') {
    const feeds = await searchRssFeedsClient(query, signal)
    return feeds.map(feed => ({
      type: 'source',
      id: feed.id,
      label: feed.title ?? feed.rss_feed_url.url,
      subtitle: getSourceSubtitle(feed),
    }))
  }

  const data = await fetchCommunities({ q: query, limit: 100, signal })
  return data.results
    .flatMap(result => {
      const community = data.communities[result.id]
      if (!isSelectableCommunity(community)) return []
      const item: AutocompleteItem = {
        type: 'community',
        id: community.id,
        label: community.name,
        subtitle: community.slug,
      }
      return [item]
    })
    .slice(0, 10)
}

function getSourceSubtitle(feed: ViewRssFeed): string {
  return feed.home_page_url?.url ?? feed.rss_feed_url.url
}

function isSelectableCommunity(community: Community | undefined): community is Community {
  return community?.visibility === 'public' && community.archived_at == null
}

function placeholderFor(
  asideType: CuratedAsideType,
  t: ReturnType<typeof useTranslations>,
): string {
  if (asideType === 'topic') {
    return t('extracted.curatedAsides.curatedAsideEntityAutocomplete.searchTopics_c9b252c2')
  }
  if (asideType === 'source') {
    return t('extracted.curatedAsides.curatedAsideEntityAutocomplete.searchSources_a46dc285')
  }
  return t('extracted.curatedAsides.curatedAsideEntityAutocomplete.searchCommunities_2685d197')
}

function ariaLabelFor(asideType: CuratedAsideType, t: ReturnType<typeof useTranslations>): string {
  if (asideType === 'topic') {
    return t('extracted.curatedAsides.curatedAsideEntityAutocomplete.searchTopics_33e3bfad')
  }
  if (asideType === 'source') {
    return t('extracted.curatedAsides.curatedAsideEntityAutocomplete.searchSources_cad97f05')
  }
  return t('extracted.curatedAsides.curatedAsideEntityAutocomplete.searchCommunities_9f7718fa')
}
