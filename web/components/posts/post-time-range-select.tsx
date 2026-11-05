'use client'

/**
 * Time range dropdown for post lists. The selection lives in the `time_range` URL param so it
 * survives reloads and sharing; the default range leaves the param out.
 */

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FILTER_CONTROL_HEIGHT } from '@/components/shared/filter-control-height'
import { useTranslations } from '@/lib/i18n/use-translations'
import { DataPw } from '@/components/shared/data-pw'
import {
  DEFAULT_POST_TIME_RANGE,
  POST_TIME_RANGES,
  isPostTimeRange,
  type PostTimeRange,
} from '@/lib/posts/time-range'

interface PostTimeRangeSelectProps {
  /** Ranges offered, in display order. Defaults to every range. */
  options?: readonly PostTimeRange[]
  /** Overrides the range read from the URL. */
  value?: PostTimeRange
}

export function PostTimeRangeSelect(props: PostTimeRangeSelectProps) {
  return (
    <Suspense fallback={null}>
      <PostTimeRangeSelectContent {...props} />
    </Suspense>
  )
}

function PostTimeRangeSelectContent({
  options = POST_TIME_RANGES,
  value,
}: PostTimeRangeSelectProps) {
  const t = useTranslations()
  const { push } = useRouter()
  const searchParams = useSearchParams()
  const labels: Record<PostTimeRange, string> = {
    '1w': t('extracted.posts.postTimeRangeSelect.last7Days'),
    '1m': t('extracted.posts.postTimeRangeSelect.last30Days'),
    '1y': t('extracted.posts.postTimeRangeSelect.lastYear'),
    all: t('extracted.posts.postTimeRangeSelect.allTime'),
  }
  const requested = value ?? searchParams.get('time_range')
  const current = isPostTimeRange(requested) && options.includes(requested) ? requested : undefined
  const selected =
    current ?? (options.includes(DEFAULT_POST_TIME_RANGE) ? DEFAULT_POST_TIME_RANGE : options[0])

  function select(range: PostTimeRange) {
    const params = new URLSearchParams(searchParams.toString())
    if (range === DEFAULT_POST_TIME_RANGE) params.delete('time_range')
    else params.set('time_range', range)
    params.delete('after')
    push(`?${params.toString()}`, { scroll: false })
  }

  return (
    <Select
      value={selected}
      onValueChange={range => select(range as PostTimeRange)}
    >
      <SelectTrigger
        aria-label={t('extracted.posts.postTimeRangeSelect.label')}
        data-pw='post-time-range-trigger'
        className={`w-40 ${FILTER_CONTROL_HEIGHT}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(range => (
          <DataPw
            key={range}
            dataPw={`post-time-range-option-${range}`}
            as={SelectItem}
            value={range}
          >
            {labels[range]}
          </DataPw>
        ))}
      </SelectContent>
    </Select>
  )
}
