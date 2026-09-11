'use client'

import { useSelectedLayoutSegment } from 'next/navigation'

export function ReferralLinksAsideWrapper({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment()
  if (segment === 'referral-links') return null
  return children
}
