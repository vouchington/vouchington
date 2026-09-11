'use client'

import { use } from 'react'
import { TopReferralPrograms } from './top-referral-programs'
import type { TopReferralProgramsViewModel } from '@/lib/view-models/homepage-view-models'

interface TopReferralProgramsStreamingProps {
  dataPromise: Promise<TopReferralProgramsViewModel | null>
}

export function TopReferralProgramsStreaming({ dataPromise }: TopReferralProgramsStreamingProps) {
  const data = use(dataPromise)
  return <TopReferralPrograms data={data} />
}
