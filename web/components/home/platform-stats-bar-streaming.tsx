'use client'

import { use } from 'react'
import { PlatformStatsBar } from './platform-stats-bar'
import type { PlatformStatsViewModel } from '@/lib/view-models/homepage-view-models'

interface PlatformStatsBarStreamingProps {
  dataPromise: Promise<PlatformStatsViewModel | null>
}

export function PlatformStatsBarStreaming({ dataPromise }: PlatformStatsBarStreamingProps) {
  const data = use(dataPromise)
  return <PlatformStatsBar data={data} />
}
