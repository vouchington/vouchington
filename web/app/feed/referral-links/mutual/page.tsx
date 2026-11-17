import { feedRouteConfigData } from '@/lib/feed-route-config-data'
import { FeedReferralLinksListPage } from '@/components/feed/feed-referral-links-list-page'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return createNoIndexMetadata(t(feedRouteConfigData['referral-links/mutual'].title))
}

export const dynamic = 'force-dynamic'

export default async function FeedReferralLinksMutualPage() {
  return <FeedReferralLinksListPage config={feedRouteConfigData['referral-links/mutual']} />
}
