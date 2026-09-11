'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import onError from '@/lib/on-error'
import {
  fetchTopHashtags,
  type TopHashtag,
  type TopHashtagMapping,
  type TopHashtagsResponseBody,
} from '@/lib/api/client/topic-recommendations'
import { linkTopicAlias, unlinkTopicAlias } from '@/lib/api/client/topics'
import { topicHref } from '@/lib/links/entity-href'
import { TopHashtagFilters } from './top-hashtag-filters'
import { TopHashtagLinkForm } from './top-hashtag-link-form'
import { TopHashtagRow } from './top-hashtag-row'

export function TopHashtags({
  initialData,
  isAdmin,
}: {
  initialData: TopHashtagsResponseBody
  isAdmin: boolean
}) {
  const [data, setData] = useState(initialData)
  const [q, setQ] = useState('')
  const [mapping, setMapping] = useState<TopHashtagMapping>('all')
  const [loading, setLoading] = useState(false)
  const [linkingAliasId, setLinkingAliasId] = useState<string | null>(null)
  const [selectedTopic, setSelectedTopic] = useState<{ id: string; name: string } | null>(null)
  const fetchGeneration = useRef(0)
  const draftQueryRef = useRef('')
  const activeFiltersRef = useRef<{ q: string; mapping: TopHashtagMapping }>({
    q: '',
    mapping: 'all',
  })
  const requestedFiltersRef = useRef<{ q: string; mapping: TopHashtagMapping }>({
    q: '',
    mapping: 'all',
  })
  const t = useTranslations()
  function reportError(error: unknown) {
    onError(error, {
      fallback: t('extracted.topicClaims.claimTopicForm.anErrorOccurred_ddf785b7'),
      tags: { surface: 'top-hashtags' },
    })
  }
  async function search(next?: Partial<{ q: string; mapping: TopHashtagMapping; after: string }>) {
    const generation = ++fetchGeneration.current
    const filters = {
      q: next?.q ?? draftQueryRef.current,
      mapping: next?.mapping ?? requestedFiltersRef.current.mapping,
    }
    requestedFiltersRef.current = filters
    setLoading(true)
    try {
      const response = await fetchTopHashtags({
        ...filters,
        after: next?.after,
      })
      if (generation === fetchGeneration.current) {
        activeFiltersRef.current = filters
        setData(response)
      }
    } catch (error) {
      if (generation === fetchGeneration.current) {
        requestedFiltersRef.current = activeFiltersRef.current
        setMapping(activeFiltersRef.current.mapping)
        throw error
      }
    } finally {
      if (generation === fetchGeneration.current) setLoading(false)
    }
  }
  function runSearch(next?: Partial<{ q: string; mapping: TopHashtagMapping; after: string }>) {
    search(next).catch(reportError)
  }
  function updateQuery(nextQ: string) {
    draftQueryRef.current = nextQ
    setQ(nextQ)
  }
  async function linkSelectedTopic() {
    if (!linkingAliasId || !selectedTopic) return
    await linkTopicAlias(selectedTopic.id, linkingAliasId)
    setLinkingAliasId(null)
    setSelectedTopic(null)
    await search(requestedFiltersRef.current)
  }
  function runLinkSelectedTopic() {
    linkSelectedTopic().catch(reportError)
  }

  function unlink(item: TopHashtag) {
    if (!item.topic_id) return
    unlinkTopicAlias(item.topic_id, item.topic_alias_id)
      .then(() => search(requestedFiltersRef.current))
      .catch(reportError)
  }

  async function loadMore() {
    const after = data.page_info.end_cursor
    if (!after) return
    const generation = ++fetchGeneration.current
    setLoading(true)
    try {
      const next = await fetchTopHashtags({ ...activeFiltersRef.current, after })
      if (generation === fetchGeneration.current) {
        setData(current => {
          const aliasIds = new Set(current.results.map(item => item.topic_alias_id))
          const additionalResults = next.results.filter(item => {
            if (aliasIds.has(item.topic_alias_id)) return false
            aliasIds.add(item.topic_alias_id)
            return true
          })
          return {
            ...next,
            results: [...current.results, ...additionalResults],
            topics: { ...current.topics, ...next.topics },
          }
        })
      }
    } catch (error) {
      if (generation === fetchGeneration.current) throw error
    } finally {
      if (generation === fetchGeneration.current) setLoading(false)
    }
  }

  function runLoadMore() {
    loadMore().catch(reportError)
  }

  return (
    <section
      className='space-y-4'
      data-pw='top-hashtags'
    >
      <TopHashtagFilters
        mapping={mapping}
        onQueryChange={updateQuery}
        onSearch={nextMapping => {
          if (nextMapping) setMapping(nextMapping)
          runSearch(nextMapping ? { mapping: nextMapping } : undefined)
        }}
        query={q}
      />
      <ul className='space-y-2'>
        {data.results.map(item => (
          <TopHashtagRow
            key={item.topic_alias_id}
            isAdmin={isAdmin}
            item={item}
            linkedTopic={item.topic_id ? data.topics[item.topic_id] : undefined}
            onStartLink={() => {
              setSelectedTopic(null)
              setLinkingAliasId(item.topic_alias_id)
            }}
            onUnlink={unlink}
          />
        ))}
      </ul>
      {isAdmin && linkingAliasId ? (
        <TopHashtagLinkForm
          selectedTopic={selectedTopic}
          onSelect={setSelectedTopic}
          onLink={runLinkSelectedTopic}
          onCancel={() => {
            setSelectedTopic(null)
            setLinkingAliasId(null)
          }}
        />
      ) : null}
      {data.page_info.has_next_page ? (
        <Button
          type='button'
          variant='outline'
          disabled={loading}
          onClick={runLoadMore}
        >
          {t('extracted.topicRecommendations.topHashtags.loadMore_a6f8f56f')}
        </Button>
      ) : null}
    </section>
  )
}
