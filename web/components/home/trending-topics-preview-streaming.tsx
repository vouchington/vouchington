'use client'

import { use } from 'react'
import { TrendingTopicsPreview } from './trending-topics-preview'
import type { TrendingTopicsViewModel } from '@/lib/view-models/homepage-view-models'

interface TrendingTopicsPreviewStreamingProps {
  dataPromise: Promise<TrendingTopicsViewModel | null>
}

export function TrendingTopicsPreviewStreaming({
  dataPromise,
}: TrendingTopicsPreviewStreamingProps) {
  const data = use(dataPromise)
  return <TrendingTopicsPreview data={data} />
}
