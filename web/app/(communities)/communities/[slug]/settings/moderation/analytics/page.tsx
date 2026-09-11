export const dynamic = 'force-dynamic'

import nextDynamic from 'next/dynamic'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCommunity, getCommunityModerationAnalytics } from '@/lib/api/server'
import { ModerationAnalyticsRangeFilter } from '@/components/moderation/moderation-analytics-range-filter'
import { ModerationTransparencyPanel } from '@/components/moderation/moderation-transparency-panel'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { isModerationStaff } from '@/lib/auth/official-account'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { ApiError } from '@/lib/api/error'
import type { ModerationAnalyticsRange } from '@/types/moderation-analytics'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getSupplementaryTransparency } from './supplementary-transparency'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const ModerationAnalyticsDashboard = nextDynamic(
  () => import('@/components/admin/moderation-analytics/moderation-analytics-dashboard'),
)

const VALID_RANGES = new Set<ModerationAnalyticsRange>(['today', '7d', '30d', '90d', 'all'])

function parseRange(raw: string | undefined): ModerationAnalyticsRange {
  if (raw && VALID_RANGES.has(raw as ModerationAnalyticsRange))
    return raw as ModerationAnalyticsRange
  return '30d'
}

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ range?: string }>
}

type RawAnalytics =
  | { kind: 'available'; metrics: Awaited<ReturnType<typeof getCommunityModerationAnalytics>> }
  | { kind: 'unauthenticated' }
  | { kind: 'access-denied' }

async function getRawAnalytics(
  slug: string,
  range: ModerationAnalyticsRange,
): Promise<RawAnalytics> {
  try {
    return {
      kind: 'available',
      metrics: await getCommunityModerationAnalytics(slug, { range }),
    }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    if (error.status === 401) return { kind: 'unauthenticated' }
    if (error.status === 403 || error.status === 404) return { kind: 'access-denied' }
    throw error
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getCommunity(slug)
  if (!data) return {}
  return createNoIndexMetadata(`Moderation Analytics — ${data.community.name}`)
}

export default async function CommunityModerationAnalyticsPage({
  params,
  searchParams,
}: PageProps) {
  const [{ slug }, { range: rawRange }] = await Promise.all([params, searchParams])
  const currentUser = await getCurrentUser()
  const basePath = `/communities/${slug}/settings/moderation/analytics`
  const range = parseRange(rawRange)

  if (!currentUser) {
    const next = range === '30d' ? basePath : `${basePath}?range=${range}`
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }

  const t = await getTranslations()

  const isSiteModerationStaff = isModerationStaff(currentUser)
  const communityData = await getCommunity(slug)

  if (!communityData && !isSiteModerationStaff) {
    notFound()
  }

  const role =
    communityData?.membership?.removed_at == null ? communityData?.membership?.role : null
  const canViewRawAnalytics = isSiteModerationStaff || role === 'owner' || role === 'moderator'

  if (communityData && role == null && !isSiteModerationStaff) {
    notFound()
  }

  if (!canViewRawAnalytics) {
    const transparency = await getSupplementaryTransparency(slug, range)

    if (transparency.kind === 'unauthenticated') redirectToLogin(basePath, range)
    if (transparency.kind === 'community-unavailable') notFound()

    return (
      <div className='space-y-6'>
        <h1 className='text-xl font-bold sm:text-2xl md:text-3xl'>
          {t(
            'extracted.moderationAnalytics.moderationTransparencyPanel.moderationTransparency_0e1d33a9',
          )}
        </h1>
        <ModerationAnalyticsRangeFilter
          basePath={basePath}
          range={range}
          todayLabelKey='extracted.moderationAnalytics.moderationTransparencyPanel.latestReleasedDay_2a9e5b31'
        />
        {transparency.kind === 'unavailable' ? null : (
          <ModerationTransparencyPanel
            transparency={transparency.kind === 'available' ? transparency.transparency : null}
            showTitle={false}
            scope={{ communitySlug: slug }}
          />
        )}
      </div>
    )
  }

  const [analytics, transparency] = await Promise.all([
    getRawAnalytics(slug, range),
    getSupplementaryTransparency(slug, range),
  ])

  if (analytics.kind === 'unauthenticated' || transparency.kind === 'unauthenticated')
    redirectToLogin(basePath, range)

  if (analytics.kind === 'access-denied') notFound()

  if (transparency.kind === 'community-unavailable') {
    notFound()
  }

  if (transparency.kind === 'entitlement-denied' && !isSiteModerationStaff) {
    notFound()
  }

  if (analytics.kind !== 'available') notFound()

  const communityName = communityData?.community.name ?? slug

  return (
    <div className='space-y-8'>
      <ModerationAnalyticsDashboard
        metrics={analytics.metrics}
        basePath={basePath}
        title={t('extracted.analytics.page.moderationAnalytics_c7b91f8e')}
        description={t('extracted.analytics.page.moderationQueueAutomodWorkload_5b3e0a91', {
          communityName,
        })}
      />
      {transparency.kind === 'unavailable' ? null : (
        <ModerationTransparencyPanel
          transparency={transparency.kind === 'available' ? transparency.transparency : null}
          scope={{ communitySlug: slug }}
        />
      )}
    </div>
  )
}

function redirectToLogin(basePath: string, range: ModerationAnalyticsRange): never {
  const next = range === '30d' ? basePath : `${basePath}?range=${range}`
  redirect(`/login?next=${encodeURIComponent(next)}`)
}
