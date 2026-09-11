export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getMyReferralClicks } from '@/lib/api/server'
import { ReferralClicksPage } from '@/components/my/referral-clicks-page'

export const metadata: Metadata = createNoIndexMetadata('Referrals')

export default async function MyReferralsPage() {
  const data = await getMyReferralClicks()
  return <ReferralClicksPage initialData={data} />
}
