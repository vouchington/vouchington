import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'

import { getEffectiveServerFeatureFlag } from '@/lib/feature-flags/server'

export const dynamic = 'force-dynamic'

export default async function InstancesLayout({ children }: { children: ReactNode }) {
  if (!(await getEffectiveServerFeatureFlag('fediverse'))) notFound()
  return children
}
