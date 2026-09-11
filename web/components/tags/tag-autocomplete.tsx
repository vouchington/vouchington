'use client'

import { toast } from 'sonner'
import { fetchTopics } from '@/lib/api/client/topics'
import { fetchPosts } from '@/lib/api/client/posts'
import { fetchUrls } from '@/lib/api/client/urls'
import { URL_QUERY_MIN_LENGTH } from '@/lib/api/url-query-min-length'
import type { Topic } from '@/types/topics'
import type { Post } from '@/types/posts'
import type { UrlListResult } from '@/types/api-responses'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { useTranslations } from '@/lib/i18n/use-translations'
import { PostContentText } from '@/components/posts/post-content-text'

type SearchResult = Topic | Post | UrlListResult

interface Props {
  objectType: 'topic' | 'post' | 'url'
  excludeIds?: string[]
  onSelect: (id: string) => void
  placeholder?: string
  disabled?: boolean
}

export function TagAutocomplete({
  objectType,
  excludeIds,
  onSelect,
  placeholder,
  disabled,
}: Props) {
  const t = useTranslations()
  const resolvedExcludeIds = excludeIds ?? []

  async function search(q: string, signal: AbortSignal): Promise<SearchResult[]> {
    if (objectType === 'topic') {
      const res = await fetchTopics({ q, limit: 10, signal })
      return Object.values(res.topics ?? {}).filter(t => !resolvedExcludeIds.includes(t.id))
    }

    if (objectType === 'post') {
      const res = await fetchPosts({ q, limit: 10, signal })
      return Object.values(res.posts ?? {}).filter(p => !resolvedExcludeIds.includes(p.id))
    }

    const res = await fetchUrls({ query: q, limit: 10, signal })
    return res.results.filter(u => !resolvedExcludeIds.includes(u.id))
  }

  function getDisplayName(item: SearchResult): string {
    if ('name' in item && item.name) return item.name
    if ('title' in item && item.title) return item.title
    if ('url' in item && item.url) {
      try {
        const parsed = new URL(item.url)
        return parsed.hostname + parsed.pathname
      } catch {
        return item.url
      }
    }
    return item.id
  }

  const placeholderText =
    placeholder || t('extracted.tags.tagAutocomplete.searchObjecttypeS_3b39bff4', { objectType })

  return (
    <EntityAutocomplete
      search={search}
      getKey={(item: SearchResult) => item.id}
      getItemValue={(item: SearchResult) => item.id}
      placeholder={placeholderText}
      ariaLabel={
        placeholder ||
        t('extracted.tags.tagAutocomplete.searchObjecttypeS_95708584', { objectType })
      }
      emptyText={t('extracted.tags.tagAutocomplete.noObjecttypeSFound_26a7e900', { objectType })}
      disabled={disabled}
      clearResultsOnSelect
      minQueryLength={objectType === 'url' ? URL_QUERY_MIN_LENGTH : undefined}
      minQueryLengthText={t(
        'extracted.tags.tagAutocomplete.typeAtLeastMinlengthCharactersTo_b5ebe107',
        { minLength: URL_QUERY_MIN_LENGTH },
      )}
      dataPw={{
        input: `tag-autocomplete-input-${objectType}`,
        item: `tag-autocomplete-item-${objectType}`,
      }}
      onSearchError={() =>
        toast.error(t('extracted.tags.tagAutocomplete.searchFailedPleaseTryAgain_46a6a88b'))
      }
      onSelect={(item: SearchResult, { setQuery }: { setQuery: (query: string) => void }) => {
        onSelect(item.id)
        setQuery('')
      }}
      renderItem={(item: SearchResult) =>
        'post_type' in item ? (
          <PostContentText
            as='span'
            content={{
              text: item.title,
              declared_language: item.declared_language,
              lingua_rs_detected_language: item.lingua_rs_detected_language,
            }}
            fallback={item.id}
          />
        ) : (
          getDisplayName(item)
        )
      }
    />
  )
}
