import { feedRouteConfigs } from '@/lib/feed-route-configs'
import { FeedReferralLinksListPage } from '@/components/feed/feed-referral-links-list-page'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return createNoIndexMetadata(t(feedRouteConfigs['referral-links'].title))
}

export const dynamic = 'force-dynamic'

export default async function FeedReferralLinksPage() {
  return <FeedReferralLinksListPage config={feedRouteConfigs['referral-links']} />
}
