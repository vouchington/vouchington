'use client'

import { use } from 'react'
import { TrendingFeeds } from './trending-feeds'
import type { TrendingFeedsViewModel } from '@/lib/view-models/homepage-view-models'

interface TrendingFeedsStreamingProps {
  dataPromise: Promise<TrendingFeedsViewModel | null>
}

export function TrendingFeedsStreaming({ dataPromise }: TrendingFeedsStreamingProps) {
  const data = use(dataPromise)
  return <TrendingFeeds data={data} />
}
