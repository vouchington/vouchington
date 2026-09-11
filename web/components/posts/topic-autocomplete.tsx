'use client'

import type { Ref } from 'react'
import { fetchTopics } from '@/lib/api/client/topics'
import type { Topic, TopicTypes } from '@/types/topics'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  value: string | null
  label: string
  onChange: (id: string, name: string) => void
  /** Filter by topic type(s). Do not combine with spendingCategory. */
  topicTypes?: TopicTypes[]
  /** Filter to spending-category topics only. Do not combine with topicTypes. */
  spendingCategory?: boolean
  placeholder?: string
  /** Accessible name for the search input. Set when placeholder or filters narrow the semantics. */
  ariaLabel?: string
  id?: string
  disabled?: boolean
  /** Topic IDs to exclude from search results (e.g. already-selected topics). */
  excludeIds?: string[]
  /** Ref forwarded to the underlying search input element. */
  inputRef?: Ref<HTMLInputElement>
  /** Clear the stored id when the user edits the search text without re-selecting a result. */
  clearOnTextEdit?: boolean
}

export function TopicAutocomplete({
  value,
  label,
  onChange,
  topicTypes,
  spendingCategory,
  placeholder,
  ariaLabel,
  id,
  disabled,
  excludeIds,
  inputRef,
  clearOnTextEdit,
}: Props) {
  const t = useTranslations()
  const resolvedPlaceholder =
    placeholder ?? t('extracted.posts.topicAutocomplete.searchTopics_c9b252c2')
  const resolvedAriaLabel =
    ariaLabel ?? t('extracted.posts.topicAutocomplete.searchTopics_33e3bfad')
  const search = async (q: string, signal: AbortSignal) => {
    const res = await fetchTopics({
      q,
      limit: 10,
      topic_types: topicTypes,
      spending_category: spendingCategory,
      signal,
    })
    const all = Object.values(res.topics ?? {})
    return excludeIds && excludeIds.length > 0
      ? all.filter(topic => !excludeIds.includes(topic.id))
      : all
  }

  return (
    <EntityAutocomplete
      queryLabel={label}
      search={search}
      getKey={(topic: Topic) => topic.id}
      getItemValue={(topic: Topic) => topic.id}
      placeholder={resolvedPlaceholder}
      ariaLabel={resolvedAriaLabel}
      emptyText={t('extracted.posts.topicAutocomplete.noTopicsFound_bd17fa16')}
      id={id}
      disabled={disabled}
      inputRef={inputRef}
      dataPw={{
        input: 'topic-autocomplete-input',
        item: 'topic-autocomplete-item',
      }}
      onQueryChange={
        clearOnTextEdit
          ? query => {
              if (value) onChange('', query)
            }
          : undefined
      }
      onSelect={(topic: Topic, { setQuery }: { setQuery: (query: string) => void }) => {
        onChange(topic.id, topic.name)
        setQuery(topic.name)
      }}
      renderItem={(topic: Topic) => topic.name}
    />
  )
}
