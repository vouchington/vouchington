'use client'

import { use } from 'react'
import { TopCommunities } from './top-communities'
import type { TopCommunitiesViewModel } from '@/lib/view-models/homepage-view-models'

interface TopCommunitiesStreamingProps {
  dataPromise: Promise<TopCommunitiesViewModel | null>
}

export function TopCommunitiesStreaming({ dataPromise }: TopCommunitiesStreamingProps) {
  const data = use(dataPromise)
  return <TopCommunities data={data} />
}
