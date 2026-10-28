export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getAdminLandingPageAnalytics } from '@/lib/api/server/admin-landing-pages'
import { LandingPageAnalyticsDashboard } from '@/components/my/landing-page-analytics-dashboard'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Landing Page Analytics | Admin')

interface PageProps {
  params: Promise<{ idOrUsername: string; slug: string }>
}

export default async function AdminLandingPageAnalyticsPage({ params }: PageProps) {
  await requireAdmin()
  const { idOrUsername, slug } = await params
  let analyticsData: Awaited<ReturnType<typeof getAdminLandingPageAnalytics>> = null
  try {
    analyticsData = await getAdminLandingPageAnalytics(idOrUsername, slug)
  } catch (err) {
    console.error('Failed to load admin landing page analytics:', err)
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
