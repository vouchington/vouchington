import { notFound, permanentRedirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  getAdminLandingPageAnalytics,
  getAdminLandingPageCanonicalIdentity,
} from '@/lib/api/server/admin-landing-pages'
import { adminLandingPageAnalyticsHref } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata('Landing Page Analytics | Admin')

export default async function LegacyAdminLandingPageAnalyticsPage({
  params,
}: {
  params: Promise<{ pageId: string }>
}) {
  await requireAdmin()
  const { pageId } = await params
  const identity = await getAdminLandingPageCanonicalIdentity(pageId)
  if (!identity) notFound()
  const analytics = await getAdminLandingPageAnalytics(identity.owner_username, identity.page_slug)
  if (!analytics) notFound()
  permanentRedirect(adminLandingPageAnalyticsHref(identity.owner_username, identity.page_slug))
}
