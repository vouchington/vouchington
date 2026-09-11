'use client'

import { toast } from 'sonner'
import { fetchTopics } from '@/lib/api/client/topics'
import { searchRssFeedsClient } from '@/lib/api/client/rss-feeds'
import { fetchPosts } from '@/lib/api/client/posts'
import { fetchHostnames } from '@/lib/api/client/hostnames'
import { fetchUrls } from '@/lib/api/client/urls'
import { URL_QUERY_MIN_LENGTH } from '@/lib/api/url-query-min-length'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { PostContentText } from '@/components/posts/post-content-text'
import { communityListItemTypeCatalog } from '@voucha/types/entities/community-list-item-type'
import type { CommunityListItemType } from '@voucha/types/entities/community'
import { useTranslations } from '@/lib/i18n/use-translations'

type SearchResult = {
  id: string
  displayName: string
} & (
  | { kind: 'ui-text' }
  | {
      kind: 'post-content'
      declared_language: string | null | undefined
      lingua_rs_detected_language: string | null | undefined
    }
)

interface Props {
  itemType: CommunityListItemType
  onSelect: (entityId: string) => void
  disabled?: boolean
}

async function searchByItemType(
  itemType: CommunityListItemType,
  q: string,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  switch (itemType) {
    case 'topic': {
      const res = await fetchTopics({ q, limit: 10, signal })
      return res.results.flatMap(r => {
        const topic = res.topics?.[r.id]
        return topic ? [{ id: topic.id, displayName: topic.name, kind: 'ui-text' as const }] : []
      })
    }
    case 'rss_feed': {
      const feeds = await searchRssFeedsClient(q, signal)
      return feeds.map(f => ({ id: f.id, displayName: f.title, kind: 'ui-text' as const }))
    }
    case 'post': {
      const res = await fetchPosts({ q, limit: 10, signal })
      return res.results.flatMap(r => {
        const post = res.posts?.[r.id]
        return post
          ? [
              {
                id: post.id,
                displayName: post.title ?? post.id,
                kind: 'post-content' as const,
                declared_language: post.declared_language,
                lingua_rs_detected_language: post.lingua_rs_detected_language,
              },
            ]
          : []
      })
    }
    case 'url_hostname': {
      const res = await fetchHostnames({ q, limit: 10, signal })
      return res.results.flatMap(ref => {
        const hostname = res.hostnames[ref.id]
        return hostname
          ? [{ id: hostname.id, displayName: hostname.hostname, kind: 'ui-text' as const }]
          : []
      })
    }
    case 'url': {
      const res = await fetchUrls({ query: q, limit: 10, signal })
      return res.results.map(u => {
        let displayName: string
        try {
          const parsed = new URL(u.url)
          displayName = parsed.hostname + parsed.pathname
        } catch {
          displayName = u.url
        }
        return { id: u.id, displayName, kind: 'ui-text' as const }
      })
    }
  }
}

export function CommunityListAutocomplete({ itemType, onSelect, disabled }: Props) {
  const t = useTranslations()
  const search = async (q: string, signal: AbortSignal) => searchByItemType(itemType, q, signal)
  const { searchLabel } = communityListItemTypeCatalog[itemType]

  const placeholder = t(
    'extracted.communities.communityListAutocomplete.searchSearchlabel_d09fcc01',
    {
      searchLabel,
    },
  )

  return (
    <EntityAutocomplete
      search={search}
      getKey={(item: SearchResult) => item.id}
      getItemValue={(item: SearchResult) => item.id}
      placeholder={placeholder}
      ariaLabel={placeholder}
      emptyText={t('extracted.communities.communityListAutocomplete.noSearchlabelFound_05f5249d', {
        searchLabel,
      })}
      disabled={disabled}
      clearResultsOnSelect
      dataPw={{
        input: `community-list-autocomplete-input-${itemType}`,
        item: `community-list-autocomplete-item-${itemType}`,
      }}
      minQueryLength={itemType === 'url' ? URL_QUERY_MIN_LENGTH : undefined}
      minQueryLengthText={t(
        'extracted.communities.communityListAutocomplete.typeAtLeastMinCharactersTo_da139d3a',
        { min: URL_QUERY_MIN_LENGTH },
      )}
      onSearchError={() =>
        toast.error(
          t('extracted.communities.communityListAutocomplete.searchFailedPleaseTryAgain_46a6a88b'),
        )
      }
      onSelect={(item: SearchResult, { setQuery }: { setQuery: (query: string) => void }) => {
        onSelect(item.id)
        setQuery('')
      }}
      renderItem={(item: SearchResult) =>
        item.kind === 'post-content' ? (
          <PostContentText
            as='span'
            content={{
              text: item.displayName,
              declared_language: item.declared_language,
              lingua_rs_detected_language: item.lingua_rs_detected_language,
            }}
            fallback={item.id}
          />
        ) : (
          item.displayName
        )
      }
    />
  )
}
