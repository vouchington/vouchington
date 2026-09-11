export const dynamic = 'force-dynamic'

import nextDynamic from 'next/dynamic'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getGrowthMetrics } from '@/lib/api/server/growth-metrics'
import type { GrowthRange } from '@/types/growth-metrics'

export const metadata: Metadata = createNoIndexMetadata('Growth Dashboard')

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const GrowthDashboard = nextDynamic(() => import('@/components/admin/growth/growth-dashboard'))

const VALID_RANGES = new Set<GrowthRange>(['today', '7d', '30d', '90d', 'all'])

function parseRange(raw: string | undefined): GrowthRange {
  if (raw && VALID_RANGES.has(raw as GrowthRange)) return raw as GrowthRange
  return '30d'
}

interface PageProps {
  searchParams: Promise<{ range?: string }>
}

export default async function GrowthPage({ searchParams }: PageProps) {
  const { range: rawRange } = await searchParams
  const range = parseRange(rawRange)
  const metrics = await getGrowthMetrics({ range })

  return <GrowthDashboard metrics={metrics} />
}
