import { feedRouteConfigs } from '@/lib/feed-route-configs'
import { FeedReferralLinksListPage } from '@/components/feed/feed-referral-links-list-page'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'

export const metadata: Metadata = createNoIndexMetadata(
  defaultTranslator(feedRouteConfigs['referral-links/mutual'].title),
)

export const dynamic = 'force-dynamic'

export default async function FeedReferralLinksMutualPage() {
  return <FeedReferralLinksListPage config={feedRouteConfigs['referral-links/mutual']} />
}
