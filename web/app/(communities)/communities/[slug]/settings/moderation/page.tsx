export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getCommunity } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { isAdmin, isModerationStaff } from '@/lib/auth/account-type'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
import { getTranslations } from '@/lib/i18n/get-translations'
import { CommunityModerationPanels } from './community-moderation-panels'
import { loadCommunityModerationPanels } from './community-moderation-data'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ reportSort?: string; tab?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getCommunity(slug)
  if (!data) return {}
  return createNoIndexMetadata(`Moderation — ${data.community.name}`)
}

export default async function CommunityModerationPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { reportSort: rawReportSort, tab: rawTab } = (await searchParams) ?? {}
  const requestedReportSort = parseCommunityReportSort(rawReportSort)
  const activeTab = parseModQueueTab(rawTab)
  const activeTabIsExplicit = isModQueueTab(rawTab)
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/login')
  }

  const communityData = await getCommunity(slug)

  if (!communityData) {
    notFound()
  }

  const { community, membership } = communityData
  const role = membership?.removed_at == null ? membership?.role : null

  if (!isAdmin(currentUser) && role !== 'owner' && role !== 'moderator') {
    notFound()
  }

  const isStaff = isModerationStaff(currentUser)
  const reportSort =
    !isStaff && requestedReportSort === 'severity' ? 'created_at_desc' : requestedReportSort
  const panels = await loadCommunityModerationPanels(slug, reportSort)
  const t = await getTranslations()

  return (
    <CommunityModerationPanels
      community={community}
      currentUserId={currentUser.id}
      isStaff={isStaff}
      reportSort={reportSort}
      activeTab={activeTab}
      activeTabIsExplicit={activeTabIsExplicit}
      panels={panels}
      t={t}
    />
  )
}

function parseCommunityReportSort(value: string | undefined) {
  if (
    value === 'severity' ||
    value === 'most_reported' ||
    value === 'created_at_asc' ||
    value === 'created_at_desc'
  ) {
    return value
  }
  return 'severity'
}

function isModQueueTab(value: string | undefined): value is 'reports' | 'posts' | 'escalated' {
  return value === 'reports' || value === 'posts' || value === 'escalated'
}

function parseModQueueTab(value: string | undefined): 'reports' | 'posts' | 'escalated' {
  return isModQueueTab(value) ? value : 'reports'
}
