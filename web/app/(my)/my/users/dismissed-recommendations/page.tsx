export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Dismissed User Recommendations')

export default function MyUsersDismissedRecommendationsPage() {
  redirect('/my/friend-recommendations/dismissed')
}
