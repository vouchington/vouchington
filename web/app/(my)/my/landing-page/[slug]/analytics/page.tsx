export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getMyLandingPageAnalytics } from '@/lib/api/server/landing-page-analytics'
import { getMyLandingPage, getMyLandingPages } from '@/lib/api/server'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'
import { LandingPageAnalyticsDashboard } from '@/components/my/landing-page-analytics-dashboard'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata = createNoIndexMetadata('Landing Page Analytics')

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function LandingPageAnalyticsPage({ params }: PageProps) {
  const { slug } = await params
  const currentUser = await getCurrentUser()
  if (!currentUser) notFound()

  const pagesData = await getMyLandingPages()
  const pageRow = pagesData.results.find(p => p.slug === slug)
  if (!pageRow) notFound()

  const [analytics, landingPage] = await Promise.all([
    getMyLandingPageAnalytics(pageRow.id),
    returnNullForMissingEntity(getMyLandingPage(pageRow.id)),
  ])
  if (!analytics) notFound()

  return (
    <LandingPageAnalyticsDashboard
      analytics={analytics}
      items={landingPage?.landing_page?.items ?? []}
    />
  )
}
