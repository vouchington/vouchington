'use client'

import { Users, Star } from 'lucide-react'
import { formatCompactNumber, calculateAverageRating } from '@ts-shared/utils/format'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import type { Topic, TopicMetrics } from '@/types/topics'

interface TopicCardMetricsProps {
  topic: Pick<Topic, 'should_allow_reviews'>
  metrics?: Pick<TopicMetrics, 'ratings' | 'bookmarks'>
}

export function TopicCardMetrics({ topic, metrics }: TopicCardMetricsProps) {
  const uiLocale = useUiLocale()
  const averageRating = metrics?.ratings ? calculateAverageRating(metrics.ratings.count) : null
  const followerCount = metrics?.bookmarks.follow || 0
  const reviewCount = metrics?.ratings
    ? Object.values(metrics.ratings.count).reduce((sum, count) => sum + count, 0)
    : 0

  return (
    <div className='mt-2 flex items-center gap-4 text-sm text-muted-foreground'>
      {/* Average rating — hidden for topics that don't allow reviews */}
      {topic.should_allow_reviews && averageRating !== null && (
        <div className='flex items-center gap-1'>
          <Star className='h-4 w-4 fill-yellow-400 text-yellow-400' />
          <span>{averageRating.toFixed(1)}</span>
        </div>
      )}

      {/* Review count — hidden for topics that don't allow reviews */}
      {topic.should_allow_reviews && reviewCount > 0 && (
        <span>{formatCompactNumber(reviewCount, uiLocale)} reviews</span>
      )}

      {/* Follower count */}
      {followerCount > 0 && (
        <div className='flex items-center gap-1'>
          <Users className='h-4 w-4' />
          <span>{formatCompactNumber(followerCount, uiLocale)} followers</span>
        </div>
      )}
    </div>
  )
}
