export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  getAdminLandingPageAnalytics,
  getAdminLandingPageCanonicalIdentity,
} from '@/lib/api/server/admin-landing-pages'
import { getUserProfile } from '@/lib/api/server/users'
import { LandingPageAnalyticsDashboard } from '@/components/my/landing-page-analytics-dashboard'
import { PageWithAside } from '@/components/page-with-aside'
import { adminLandingPageAnalyticsHref, landingPageNamedHref } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { isUUID } from '@ts-shared/utils/validation-core'

export const metadata: Metadata = createNoIndexMetadata('Landing Page Analytics | Admin')

interface PageProps {
  params: Promise<{ idOrUsername: string; slug: string }>
}

export default async function AdminLandingPageAnalyticsPage({ params }: PageProps) {
  await requireAdmin()
  const { idOrUsername, slug } = await params
  const ownerIsUuid = isUUID(idOrUsername)
  const pageIsUuid = isUUID(slug)
  const owner = ownerIsUuid || pageIsUuid ? await getUserProfile(idOrUsername) : null
  if ((ownerIsUuid || pageIsUuid) && !owner?.user.username) notFound()
  const pageIdentity = pageIsUuid ? await getAdminLandingPageCanonicalIdentity(slug) : null
  if (pageIsUuid && (!pageIdentity || pageIdentity.owner_user_id !== owner?.user.id)) notFound()
  const username = owner?.user.username ?? idOrUsername
  const pageSlug = pageIdentity?.page_slug ?? slug
  let analyticsData: Awaited<ReturnType<typeof getAdminLandingPageAnalytics>> = null
  try {
    analyticsData = await getAdminLandingPageAnalytics(username, pageSlug)
  } catch (err) {
    console.error('Failed to load admin landing page analytics:', err)
  }

  if (!analyticsData) {
    notFound()
  }

  if (ownerIsUuid || pageIsUuid) {
    permanentRedirect(adminLandingPageAnalyticsHref(username, pageSlug))
  }

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-6'>
        <Link
          href={landingPageNamedHref(username, pageSlug)}
          prefetch={false}
          data-pw='admin-landing-analytics-back-link'
          className='inline-block text-sm text-muted-foreground hover:underline'
        >
          ← Landing page
        </Link>
        <LandingPageAnalyticsDashboard
          analytics={analyticsData.analytics}
          items={analyticsData.landing_page.items}
        />
      </div>
    </PageWithAside>
  )
}
