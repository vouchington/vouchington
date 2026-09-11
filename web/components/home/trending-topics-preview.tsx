'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { HoverableCard } from '@/components/shared/hoverable-card'
import { Star, Users } from 'lucide-react'
import { formatCompactNumber } from '@ts-shared/utils'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import type { TrendingTopicsViewModel } from '@/lib/view-models/homepage-view-models'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TrendingTopicsPreviewProps {
  data: TrendingTopicsViewModel | null
}

export function TrendingTopicsPreview({ data }: TrendingTopicsPreviewProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  if (!data || data.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('extracted.home.trendingTopicsPreview.noTrendingTopicsYet_5edc6f6b')}{' '}
        <Link
          href='/topics'
          prefetch={false}
          className='text-primary underline hover:no-underline'
        >
          {t('extracted.home.trendingTopicsPreview.browseAllTopics_6b8bf4fd')}
        </Link>
      </p>
    )
  }

  return (
    <div className='space-y-3'>
      <div className='grid min-w-0 gap-3 sm:grid-cols-2'>
        {data.map(topic => {
          return (
            <HoverableCard
              asChild
              key={topic.id}
              className='flex min-w-0 max-w-full items-start gap-3'
            >
              <Link
                href={topic.href}
                prefetch={false}
              >
                <div className='min-w-0 flex-1 space-y-1'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <h3 className='min-w-0 flex-1 truncate font-medium'>{topic.name}</h3>
                    <Badge
                      variant='secondary'
                      className='shrink-0 text-xs'
                    >
                      {t(topic.typeLabel)}
                    </Badge>
                  </div>
                  <div className='flex flex-wrap items-center gap-3 text-xs text-muted-foreground'>
                    {topic.allowReviews && topic.averageRating !== null && (
                      <span className='flex items-center gap-1'>
                        <Star className='h-3 w-3 fill-yellow-400 text-yellow-400' />
                        {topic.averageRating.toFixed(1)}
                      </span>
                    )}
                    {topic.followerCount > 0 && (
                      <span className='flex items-center gap-1'>
                        <Users className='h-3 w-3' />
                        {formatCompactNumber(topic.followerCount, uiLocale)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </HoverableCard>
          )
        })}
      </div>
      <div className='text-sm'>
        <Link
          href='/topics'
          prefetch={false}
          className='text-primary hover:underline'
        >
          {t('extracted.home.trendingTopicsPreview.browseAllTopics_44e4ba00')}
        </Link>
      </div>
    </div>
  )
}
