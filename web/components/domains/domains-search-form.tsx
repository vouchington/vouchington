'use client'

import { useRouter } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { FILTER_CONTROL_HEIGHT } from '@/components/shared/filter-control-height'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  defaultQuery?: string
  isAdmin?: boolean
  defaultBlocked?: string
  defaultCrawlable?: string
}

export function DomainsSearchForm(props: Props) {
  return (
    <Suspense fallback={null}>
      <DomainsSearchFormContent {...props} />
    </Suspense>
  )
}

function DomainsSearchFormContent({
  defaultQuery,
  isAdmin,
  defaultBlocked,
  defaultCrawlable,
}: Props) {
  const t = useTranslations()
  const router = useRouter()
  const [query, setQuery] = useState(defaultQuery ?? '')
  const [blocked, setBlocked] = useState(defaultBlocked ?? 'all')
  const [crawlable, setCrawlable] = useState(defaultCrawlable ?? 'all')

  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        const params = new URLSearchParams(window.location.search)
        params.delete('q')
        if (query) params.set('query', query)
        else params.delete('query')
        if (isAdmin) {
          if (blocked !== 'all') params.set('blocked', blocked)
          else params.delete('blocked')
          if (crawlable !== 'all') params.set('crawlable', crawlable)
          else params.delete('crawlable')
        } else {
          params.delete('blocked')
          params.delete('crawlable')
        }
        params.delete('after')
        router.push(`${window.location.pathname}?${params.toString()}`)
      }}
      className='flex flex-wrap gap-3'
    >
      <Input
        aria-label={t('extracted.domains.domainsSearchForm.searchDomains_df3b2794')}
        data-pw='domains-search-input'
        type='search'
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder={t('extracted.domains.domainsSearchForm.searchDomains_df3b2794')}
        className={cn('min-w-40 flex-1', FILTER_CONTROL_HEIGHT)}
      />
      {isAdmin && (
        <>
          <Select
            value={blocked}
            onValueChange={setBlocked}
          >
            <SelectTrigger
              aria-label={t('extracted.domains.domainsSearchForm.blockedFilter_7f66e071')}
              className={cn('w-40', FILTER_CONTROL_HEIGHT)}
            >
              <SelectValue
                placeholder={t('extracted.domains.domainsSearchForm.allBlocked_8a7b119c')}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>
                {t('extracted.domains.domainsSearchForm.allBlocked_8a7b119c')}
              </SelectItem>
              <SelectItem value='true'>
                {t('extracted.domains.domainsSearchForm.blocked_18f2a094')}
              </SelectItem>
              <SelectItem value='false'>
                {t('extracted.domains.domainsSearchForm.notBlocked_8625218c')}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={crawlable}
            onValueChange={setCrawlable}
          >
            <SelectTrigger
              aria-label={t('extracted.domains.domainsSearchForm.crawlableFilter_d309fd94')}
              className={cn('w-44', FILTER_CONTROL_HEIGHT)}
            >
              <SelectValue
                placeholder={t('extracted.domains.domainsSearchForm.allCrawlable_4467c377')}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>
                {t('extracted.domains.domainsSearchForm.allCrawlable_4467c377')}
              </SelectItem>
              <SelectItem value='true'>
                {t('extracted.domains.domainsSearchForm.crawlable_8e55a03f')}
              </SelectItem>
              <SelectItem value='false'>
                {t('extracted.domains.domainsSearchForm.notCrawlable_7171ab3b')}
              </SelectItem>
            </SelectContent>
          </Select>
        </>
      )}
      <Button
        type='submit'
        data-pw='domains-search-submit'
        className={FILTER_CONTROL_HEIGHT}
      >
        {t('extracted.domains.domainsSearchForm.search_49c266ba')}
      </Button>
    </form>
  )
}
