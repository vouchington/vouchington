'use client'

import { useEffect, useId, useMemo, useState, type ComponentProps } from 'react'
import { fetchTopics } from '@/lib/api/client/topics'
import { getTopicDisplayTitle } from '@/lib/topics/display-name'
import { SearchInput } from './search-input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Topic } from '@/types/topics'
import { FILTER_CONTROL_HEIGHT } from './filter-control-height'

type HashtagSearchInputProps = Omit<ComponentProps<typeof SearchInput>, 'onChange' | 'value'> & {
  value: string
  onValueChange: (value: string) => void
  enableHashtagSearch?: boolean
}

export function HashtagSearchInput({
  value,
  onValueChange,
  enableHashtagSearch = true,
  className,
  onKeyDown,
  ...props
}: HashtagSearchInputProps) {
  const resultsId = useId()
  const [suggestions, setSuggestions] = useState<{
    query: string | null
    topics: Topic[]
    activeIndex: number
  }>({
    query: null,
    topics: [],
    activeIndex: 0,
  })
  const activeToken = useMemo(
    () => (enableHashtagSearch ? getActiveHashToken(value) : null),
    [enableHashtagSearch, value],
  )
  const topics = activeToken && suggestions.query === activeToken.query ? suggestions.topics : []
  const activeIndex = Math.min(suggestions.activeIndex, Math.max(topics.length - 1, 0))
  const activeOptionId =
    topics.length > 0 && topics[activeIndex]
      ? `${resultsId}-option-${topics[activeIndex].id}`
      : undefined
  const comboboxProps = enableHashtagSearch
    ? {
        role: 'combobox' as const,
        tabIndex: 0,
        'aria-autocomplete': 'list' as const,
        'aria-expanded': topics.length > 0,
        'aria-controls': topics.length > 0 ? resultsId : undefined,
        'aria-activedescendant': activeOptionId,
      }
    : {}

  useEffect(() => {
    if (!activeToken?.query.trim()) {
      return
    }
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      fetchTopics({ q: activeToken.query, sort: 'relevance', limit: 8, signal: controller.signal })
        .then(data => {
          const orderedTopics = data.results.flatMap(result =>
            data.topics[result.id] ? [data.topics[result.id] as Topic] : [],
          )
          setSuggestions({ query: activeToken.query, topics: orderedTopics, activeIndex: 0 })
        })
        .catch(error => {
          if ((error as { name?: string }).name !== 'AbortError') {
            setSuggestions({ query: activeToken.query, topics: [], activeIndex: 0 })
          }
        })
    }, 300)
    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [activeToken])

  function appendTopic(topic: Topic) {
    if (!activeToken) return
    const rest = value.slice(activeToken.end)
    const nextValue = `${value.slice(0, activeToken.start)}#${topic.slug} ${rest}`.replace(
      /\s+/g,
      ' ',
    )
    onValueChange(nextValue)
    setSuggestions({ query: null, topics: [], activeIndex: 0 })
  }

  return (
    <div className={cn('relative min-w-0 flex-1', className)}>
      <SearchInput
        {...props}
        {...comboboxProps}
        value={value}
        onChange={event => onValueChange(event.target.value)}
        onKeyDown={event => {
          if (topics.length > 0) {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setSuggestions(current => ({
                query: current.query,
                topics: current.topics,
                activeIndex: (current.activeIndex + 1) % topics.length,
              }))
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setSuggestions(current => ({
                query: current.query,
                topics: current.topics,
                activeIndex: (current.activeIndex - 1 + topics.length) % topics.length,
              }))
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              appendTopic(topics[activeIndex]!)
              return
            }
            if (event.key === 'Escape') {
              setSuggestions({ query: null, topics: [], activeIndex: 0 })
              return
            }
          }
          onKeyDown?.(event)
        }}
        className={cn(FILTER_CONTROL_HEIGHT, 'min-w-0')}
      />
      {topics.length > 0 ? (
        <div
          id={resultsId}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Hashtag suggestions follow the ARIA combobox listbox pattern.
          role='listbox'
          className='absolute left-0 top-full z-50 mt-1 max-h-64 w-full min-w-0 max-w-[calc(100vw-2rem)] overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md'
          data-pw='hashtag-topic-search-results'
        >
          {topics.map((topic, index) => (
            <Button
              id={`${resultsId}-option-${topic.id}`}
              key={topic.id}
              type='button'
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Hashtag suggestions are interactive buttons exposed as combobox options.
              role='option'
              tabIndex={-1}
              aria-selected={index === activeIndex}
              variant='ghost'
              className={cn(
                'flex h-auto w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm',
                index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent',
              )}
              onMouseEnter={() =>
                setSuggestions(current => ({
                  query: current.query,
                  topics: current.topics,
                  activeIndex: index,
                }))
              }
              onClick={() => appendTopic(topic)}
              data-pw='hashtag-topic-search-option'
            >
              <span className='truncate'>{getTopicDisplayTitle(topic)}</span>
              <span className='ml-3 shrink-0 text-xs text-muted-foreground'>#{topic.slug}</span>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function getActiveHashToken(value: string): { start: number; end: number; query: string } | null {
  const match = /(^|\s)#([a-z0-9._-]*)$/i.exec(value)
  if (match?.index == null) return null
  const start = match.index + match[1]!.length
  return {
    start,
    end: value.length,
    query: match[2]!.replace(/[._]+/g, '-').replace(/-+/g, '-').toLowerCase(),
  }
}
