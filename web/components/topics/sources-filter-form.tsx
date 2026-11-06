'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { ListFilters } from '@/components/shared/list-filters'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PUBLISHER_TYPES } from '@/lib/publisher-types'
import { useTranslations } from '@/lib/i18n/use-translations'

interface SourcesFilterFormProps {
  defaultPublisherType?: string
}

const ALL_PUBLISHER_TYPES = '__all__'

export function SourcesFilterForm(props: SourcesFilterFormProps) {
  return (
    <Suspense fallback={null}>
      <SourcesFilterFormContent {...props} />
    </Suspense>
  )
}

function SourcesFilterFormContent({ defaultPublisherType }: SourcesFilterFormProps) {
  const t = useTranslations()
  const { push } = useRouter()
  const searchParams = useSearchParams()
  const sourcesSortOptions = [
    { label: t('extracted.topics.sourcesFilterForm.new_18fdd549'), value: 'new' },
  ]

  function handlePublisherTypeChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== ALL_PUBLISHER_TYPES) params.set('publisher_type', value)
    else params.delete('publisher_type')
    params.delete('after')
    push(`?${params.toString()}`, { scroll: false })
  }

  const currentPublisherType =
    searchParams.get('publisher_type') || defaultPublisherType || ALL_PUBLISHER_TYPES

  return (
    <ListFilters
      placeholder={t('extracted.topics.sourcesFilterForm.searchByTextOrTopic_a76eda0f')}
      searchLabel={t('extracted.topics.sourcesFilterForm.searchSources_cad97f05')}
      defaultSort='new'
      sortOptions={sourcesSortOptions}
      showSort={false}
      enableHashtagSearch
    >
      <Select
        value={currentPublisherType}
        onValueChange={handlePublisherTypeChange}
      >
        <SelectTrigger
          aria-label={t('extracted.topics.sourcesFilterForm.publisherType_91d08a68')}
          data-pw='sources-filter-publisher-type-trigger'
          className='h-11 w-52 sm:h-9'
        >
          <SelectValue
            placeholder={t('extracted.topics.sourcesFilterForm.allPublisherTypes_22532c6a')}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_PUBLISHER_TYPES}>
            {t('extracted.topics.sourcesFilterForm.allPublisherTypes_22532c6a')}
          </SelectItem>
          {PUBLISHER_TYPES.map(type => (
            <SelectItem
              key={type.slug}
              value={type.slug}
              // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
              data-pw={`sources-filter-publisher-type-option-${type.slug}`}
            >
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ListFilters>
  )
}
