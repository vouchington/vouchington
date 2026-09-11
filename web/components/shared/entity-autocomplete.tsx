'use client'

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

interface EntityAutocompleteSelectHelpers {
  setQuery: (query: string) => void
}

interface EntityAutocompleteProps<T> {
  queryLabel?: string
  search: (query: string, signal: AbortSignal) => Promise<T[]>
  results?: T[]
  footer?: ReactNode
  getKey: (item: T) => string
  renderItem: (item: T) => ReactNode
  onSelect: (item: T, helpers: EntityAutocompleteSelectHelpers) => void
  /** Fires on each user edit of the search text (not on programmatic seed/select). */
  onQueryChange?: (query: string) => void
  placeholder: string
  ariaLabel: string
  emptyText: ReactNode | ((query: string) => ReactNode)
  id?: string
  disabled?: boolean
  inputRef?: Ref<HTMLInputElement>
  minQueryLength?: number
  minQueryLengthText?: ReactNode
  onSearchError?: () => void
  getItemValue?: (item: T) => string
  clearResultsOnSelect?: boolean
  /** Keep the popover open after a selection (e.g. multi-select pickers). Defaults to `true`. */
  closeOnSelect?: boolean
  dataPw?: {
    input?: string
    item?: string
  }
}
function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException ||
      (typeof error === 'object' && error !== null && 'name' in error)) &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}
function EntityAutocompleteInner<T>({
  queryLabel = '',
  search,
  results: controlledResults,
  footer,
  getKey,
  renderItem,
  onSelect,
  onQueryChange,
  placeholder,
  ariaLabel,
  emptyText,
  id,
  disabled,
  inputRef,
  minQueryLength,
  minQueryLengthText,
  onSearchError,
  getItemValue,
  clearResultsOnSelect = false,
  closeOnSelect = true,
  dataPw,
}: EntityAutocompleteProps<T>) {
  const [query, setQuery] = useState(queryLabel)
  const [results, setResults] = useState<T[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  useEffect(() => {
    queueMicrotask(() => setQuery(queryLabel))
  }, [queryLabel])

  const runSearch = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortControllerRef.current?.abort()

    const trimmed = q.trim()

    if (minQueryLength !== 0 && trimmed.length < (minQueryLength || 1)) {
      setResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal

      try {
        const nextResults = await search(q, signal)
        if (signal.aborted) return
        setResults(nextResults)
      } catch (error) {
        if (signal.aborted || isAbortError(error)) return
        setResults([])
        onSearchError?.()
      }
    }, 300)
  }

  const handleInputChange = (value: string) => {
    setQuery(value)
    setOpen(true)
    runSearch(value)
    onQueryChange?.(value)
  }

  const handleSelect = (item: T) => {
    onSelect(item, { setQuery })
    if (clearResultsOnSelect) setResults([])
    if (closeOnSelect) setOpen(false)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortControllerRef.current?.abort()
    }
  }, [])

  const trimmedQuery = query.trim()
  const currentEmptyText =
    minQueryLength &&
    trimmedQuery.length > 0 &&
    trimmedQuery.length < minQueryLength &&
    minQueryLengthText
      ? minQueryLengthText
      : typeof emptyText === 'function'
        ? emptyText(query)
        : emptyText

  return (
    <Command
      shouldFilter={false}
      className='rounded-md border'
      data-pw='entity-autocomplete'
    >
      <Popover
        open={open}
        onOpenChange={setOpen}
      >
        <PopoverAnchor>
          <CommandInput
            ref={inputRef}
            placeholder={placeholder}
            value={query}
            id={id}
            aria-label={ariaLabel}
            autoComplete='off'
            disabled={disabled}
            {...(dataPw?.input && { 'data-pw': dataPw.input })}
            onValueChange={handleInputChange}
            onFocus={() => {
              if (!query && minQueryLength !== 0) return
              setOpen(true)
              if (!query) runSearch(query)
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setOpen(false)
              }
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          forceMount
          className='w-[var(--radix-popover-trigger-width)] p-0'
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <CommandList>
            <CommandEmpty data-pw='entity-autocomplete-empty'>{currentEmptyText}</CommandEmpty>
            {(controlledResults ?? results).map(item => (
              <CommandItem
                key={getKey(item)}
                value={getItemValue ? getItemValue(item) : getKey(item)}
                onSelect={() => handleSelect(item)}
                {...(dataPw?.item && { 'data-pw': dataPw.item })}
              >
                {renderItem(item)}
              </CommandItem>
            ))}
            {footer}
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  )
}
export const EntityAutocomplete = EntityAutocompleteInner
