/* eslint-disable react-you-might-not-need-an-effect/no-event-handler */
'use client'

/**
 * Global search dialog with entity-type tabs (All, Topics, Posts, News, Domains),
 * page shortcut autocomplete, and admin page shortcuts.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CommandDialog, CommandInput, CommandList } from '@/components/ui/command'
import {
  type SearchTab,
  type SearchResults,
  EMPTY_RESULTS,
  getSearchTabs,
  getMatchingShortcuts,
} from './command-search-data'
import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags'
import { ResultGroups } from './command-search/result-groups'
import { SearchTabs } from './command-search/search-tabs'
import { useSearchEffect } from './command-search/use-search-effect'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CommandSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
  isAuthenticated: boolean
}

export function CommandSearch({
  open,
  onOpenChange,
  isAdmin,
  isAuthenticated,
}: CommandSearchProps) {
  const t = useTranslations()
  const { push } = useRouter()
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<SearchTab>('all')
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const featureFlags = useFeatureFlags()
  const tabsRef = useRef<HTMLFieldSetElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const searchTabs = getSearchTabs(featureFlags)

  useSearchEffect(
    query,
    activeTab,
    featureFlags.combinedSearch === true,
    featureFlags.fediverse === true,
    setResults,
    setLoading,
  )

  // Reset query and tab when dialog closes
  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setQuery('')
        setActiveTab('all')
      })
    }
  }, [open])

  const matchedShortcuts = getMatchingShortcuts(t, query, isAdmin, isAuthenticated, featureFlags)

  useEffect(() => {
    if (!searchTabs.some(tab => tab.value === activeTab)) {
      queueMicrotask(() => setActiveTab('all'))
    }
  }, [activeTab, searchTabs])

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const buttons = tabsRef.current?.querySelectorAll<HTMLButtonElement>('button')
    if (!buttons?.length) return

    const currentIndex = [...buttons].findIndex(b => b === document.activeElement)
    if (currentIndex === -1) return

    event.preventDefault()
    const next =
      event.key === 'ArrowRight'
        ? (currentIndex + 1) % buttons.length
        : (currentIndex - 1 + buttons.length) % buttons.length
    buttons[next]!.focus()
  }

  // Arrow key tab cycling — capture-phase listener so it runs before cmdk's keydown handlers
  // which otherwise swallow ArrowLeft/ArrowRight on focused [cmdk-item] elements.
  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      // Re-focus the search input when Cmd+K / Ctrl+K is pressed while dialog is already open
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        event.stopPropagation()
        inputRef.current?.focus()
        return
      }

      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      // Do not intercept during IME composition (Japanese/Korean candidate navigation)
      if (event.isComposing) return
      // Allow modifier+arrow for text selection (Shift) and word navigation (Ctrl/Meta/Alt)
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
      // Do not intercept when a tab button is focused (handleTabKeyDown handles it)
      if (tabsRef.current?.contains(document.activeElement as Node)) return
      // When the input is focused, only cycle tabs at the boundary of the text so
      // character-by-character cursor navigation still works in the middle of a word
      if (document.activeElement === inputRef.current) {
        const input = inputRef.current!
        const { selectionStart, selectionEnd, value } = input
        if (selectionStart !== selectionEnd) return // text selected — let browser handle
        if (event.key === 'ArrowLeft' && selectionStart !== 0) return
        if (event.key === 'ArrowRight' && selectionStart !== value.length) return
      }
      event.preventDefault()
      event.stopPropagation()
      setActiveTab(prev => {
        const currentIndex = searchTabs.findIndex(t => t.value === prev)
        const nextIndex =
          event.key === 'ArrowRight'
            ? (currentIndex + 1) % searchTabs.length
            : (currentIndex - 1 + searchTabs.length) % searchTabs.length
        return searchTabs[nextIndex]!.value
      })
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, searchTabs])

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <div>
        <CommandInput
          ref={inputRef}
          placeholder={t('extracted.components.commandSearch.search_7f553822')}
          data-pw='search-input'
          value={query}
          onValueChange={setQuery}
        />
        <SearchTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onKeyDown={handleTabKeyDown}
          tabsRef={tabsRef}
          tabs={searchTabs}
        />
        {matchedShortcuts.length > 0 ||
        results.topics.length > 0 ||
        results.posts.length > 0 ||
        results.news.length > 0 ||
        results.domains.length > 0 ||
        results.communities.length > 0 ||
        results.fediverse.length > 0 ? (
          <CommandList>
            <ResultGroups
              activeTab={activeTab}
              matchedShortcuts={matchedShortcuts}
              results={results}
              onOpenChange={onOpenChange}
              pushRoute={href => push(href)}
            />
          </CommandList>
        ) : (
          <output className='block py-6 text-center text-sm'>
            {loading
              ? t('extracted.components.commandSearch.searching_78c9d9f6')
              : query.trim()
                ? t('extracted.components.commandSearch.noResultsFound_7ecdbfee')
                : t('extracted.components.commandSearch.typeToSearch_6552c370')}
          </output>
        )}
      </div>
    </CommandDialog>
  )
}
