'use client'

import { Suspense, useEffect, useId, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { TooltipButton } from '@/components/ui/_button-tooltip'
import { Label } from '@/components/ui/label'
import { HashtagSearchInput } from '@/components/shared/hashtag-search-input'
import { getSearchDefaultSortValidationError } from './list-filters-validation'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ListFiltersSortSelect } from './list-filters-sort-select'

interface SortOption<T extends string = string> {
  label: string
  value: T
  description?: string
}

interface ListFiltersProps<T extends string = string, U extends string = T> {
  placeholder?: string
  defaultSort: T
  sortOptions: SortOption<T>[]
  searchOnlySortOptions?: SortOption<U>[] // Only shown when a search query is active
  searchDefaultSort?: NoInfer<U> // Auto-selected sort when search starts (must be in searchOnlySortOptions)
  searchLabel?: string
  showSearch?: boolean
  showSort?: boolean
  enableHashtagSearch?: boolean
  children?: ReactNode
}

export function ListFilters<T extends string = string, U extends string = T>(
  props: ListFiltersProps<T, U>,
) {
  return (
    <Suspense fallback={null}>
      <ListFiltersContent {...props} />
    </Suspense>
  )
}

function ListFiltersContent<T extends string = string, U extends string = T>({
  placeholder,
  defaultSort,
  sortOptions,
  searchOnlySortOptions,
  searchDefaultSort,
  searchLabel,
  showSearch = true,
  showSort = true,
  enableHashtagSearch = false,
  children,
}: ListFiltersProps<T, U>) {
  const t = useTranslations()
  const resolvedSearchLabel = searchLabel ?? t('extracted.shared.listFilters.searchList_973f2b2b')
  const validationError = getSearchDefaultSortValidationError(
    searchDefaultSort,
    searchOnlySortOptions,
  )
  if (validationError) {
    console.error(validationError)
  }
  const validatedSearchDefaultSort = validationError ? undefined : searchDefaultSort
  const { push } = useRouter()
  const searchParams = useSearchParams()
  const searchInputId = useId()

  const currentQuery = searchParams.get('q') || ''
  const requestedSort = searchParams.get('sort') || defaultSort
  const [searchQuery, setSearchQuery] = useState(currentQuery)

  useEffect(() => {
    queueMicrotask(() => setSearchQuery(currentQuery))
  }, [currentQuery])
  const activeSearchOnlyOptions =
    searchOnlySortOptions?.filter(opt => opt.value === requestedSort) ?? []
  const allSortOptions = currentQuery
    ? [...sortOptions, ...(searchOnlySortOptions ?? [])]
    : [...sortOptions, ...activeSearchOnlyOptions]
  const currentSort = allSortOptions.some(option => option.value === requestedSort)
    ? requestedSort
    : defaultSort

  function updateFilters(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }
    params.delete('after')
    push(`?${params.toString()}`, { scroll: false })
  }

  function submitSearch(query: string) {
    const updates: Record<string, string | undefined> = { q: query || undefined }
    const rawSortParam = searchParams.get('sort')
    const currentSortParam = allSortOptions.some(option => option.value === rawSortParam)
      ? rawSortParam
      : undefined
    if (
      query &&
      validatedSearchDefaultSort &&
      (!currentSortParam || currentSortParam === defaultSort)
    ) {
      updates.sort = validatedSearchDefaultSort
    } else if (!query && currentSortParam === validatedSearchDefaultSort) {
      updates.sort = undefined
    }
    updateFilters(updates)
  }
  const sortSelect = showSort && (
    <ListFiltersSortSelect
      value={currentSort}
      options={allSortOptions}
      onValueChange={value => updateFilters({ sort: value })}
    />
  )
  if (!showSearch) {
    return (
      <div className='flex flex-1 flex-wrap items-center gap-2'>
        {children}
        {sortSelect}
      </div>
    )
  }
  const formId = `${searchInputId}-form`
  return (
    <div className='flex flex-1 flex-wrap items-center gap-2'>
      <form
        id={formId}
        className='contents'
        onSubmit={e => {
          e.preventDefault()
          submitSearch(searchQuery.trim())
        }}
      >
        <Label
          htmlFor={searchInputId}
          className='sr-only'
        >
          {resolvedSearchLabel}
        </Label>
        <HashtagSearchInput
          id={searchInputId}
          name='q'
          placeholder={placeholder}
          value={searchQuery}
          onValueChange={setSearchQuery}
          enableHashtagSearch={enableHashtagSearch}
          // oxlint-disable-next-line no-sequences -- single JSX prop needs one expression; comma avoids block expansion
          onClearValue={() => (setSearchQuery(''), submitSearch(''))}
          className='flex-1 min-w-44'
          data-pw='list-filters-search-input'
          data-route-focus-target='primary'
        />
      </form>
      {children}
      {sortSelect}
      <TooltipButton
        type='submit'
        form={formId}
        size='icon'
        aria-label={t('extracted.shared.listFilters.search_49c266ba')}
        tooltip={t('extracted.shared.listFilters.search_49c266ba')}
        data-pw='list-filters-search-submit'
        className='h-11 w-11'
      >
        <Search className='h-4 w-4' />
      </TooltipButton>
    </div>
  )
}
