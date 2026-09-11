export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getAdminLandingPageAnalytics } from '@/lib/api/server/admin-landing-pages'
import { LandingPageAnalyticsDashboard } from '@/components/my/landing-page-analytics-dashboard'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Landing Page Analytics | Admin')

interface PageProps {
  params: Promise<{ pageId: string }>
}

export default async function AdminLandingPageAnalyticsPage({ params }: PageProps) {
  await requireAdmin()
  const { pageId } = await params
  let analyticsData: Awaited<ReturnType<typeof getAdminLandingPageAnalytics>> = null
  try {
    analyticsData = await getAdminLandingPageAnalytics(pageId)
  } catch (error) {
    console.error('Failed to load admin landing page analytics:', error)
  }

  if (!analyticsData) {
    notFound()
  }

  return (
    <LandingPageAnalyticsDashboard
      analytics={analyticsData.analytics}
      items={analyticsData.landing_page.items}
    />
  )
}
