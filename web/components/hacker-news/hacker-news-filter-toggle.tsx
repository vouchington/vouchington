'use client'

import { useId } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useHackerNewsConfig } from './hacker-news-config-context'
import { HACKER_NEWS_FILTER_PARAM } from './hacker-news-filter-param'

/** List filter for "seen or mentioned on Hacker News"; the page maps it to the API filter. */
export function HackerNewsFilterToggle({
  boundPostTimeRange = false,
}: {
  boundPostTimeRange?: boolean
}) {
  const t = useTranslations()
  const config = useHackerNewsConfig()
  const id = useId()
  const { push } = useRouter()
  const searchParams = useSearchParams()
  const checked = searchParams.get(HACKER_NEWS_FILTER_PARAM) === '1'
  if (!config.references_visible) return null
  return (
    <div className='flex items-center gap-2'>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={next => {
          const params = new URLSearchParams(searchParams.toString())
          if (next === true) {
            params.set(HACKER_NEWS_FILTER_PARAM, '1')
            if (boundPostTimeRange) params.set('time_range', config.post_time_range_cap)
          } else params.delete(HACKER_NEWS_FILTER_PARAM)
          params.delete('after')
          push(`?${params.toString()}`, { scroll: false })
        }}
        data-pw='hacker-news-filter'
      />
      <Label
        htmlFor={id}
        className='text-sm'
      >
        {t('shared.hackerNews.filterLabel')}
      </Label>
    </div>
  )
}
