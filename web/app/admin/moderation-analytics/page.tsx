export const dynamic = 'force-dynamic'

import nextDynamic from 'next/dynamic'
import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getAdminModerationAnalytics } from '@/lib/api/server/moderation-analytics'
import type { ModerationAnalyticsRange } from '@/types/moderation-analytics'
import { getTranslations } from '@/lib/i18n/get-translations'
import type ModerationAnalyticsDashboardComponent from '@/components/admin/moderation-analytics/moderation-analytics-dashboard'

export const metadata: Metadata = createNoIndexMetadata('Moderation Analytics | Admin')

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const ModerationAnalyticsDashboard = nextDynamic<
  Parameters<typeof ModerationAnalyticsDashboardComponent>[0]
>(() => import('@/components/admin/moderation-analytics/moderation-analytics-dashboard'))

const VALID_RANGES = new Set<ModerationAnalyticsRange>(['today', '7d', '30d', '90d', 'all'])

function parseRange(raw: string | undefined): ModerationAnalyticsRange {
  if (raw && VALID_RANGES.has(raw as ModerationAnalyticsRange))
    return raw as ModerationAnalyticsRange
  return '30d'
}

interface PageProps {
  searchParams: Promise<{ range?: string }>
}

export default async function AdminModerationAnalyticsPage({ searchParams }: PageProps) {
  const t = await getTranslations()
  await requireAdmin()
  const { range: rawRange } = await searchParams
  const range = parseRange(rawRange)
  const metrics = await getAdminModerationAnalytics({ range })

  const breadcrumbItems = buildBreadcrumbsForPath('/admin/moderation-analytics', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'Moderation Analytics', path: '/admin/moderation-analytics' }],
  })

  return (
    <div className='space-y-4'>
      <Breadcrumbs items={breadcrumbItems} />
      <ModerationAnalyticsDashboard
        metrics={metrics}
        basePath='/admin/moderation-analytics'
        title={t('extracted.moderationAnalytics.page.moderationAnalytics_c7b91f8e')}
        description={t(
          'extracted.moderationAnalytics.page.platformWideModerationQueueAutomod_1f6c9e83',
        )}
      />
    </div>
  )
}
