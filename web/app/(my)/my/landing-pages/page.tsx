export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { LandingPagesIndex } from '@/components/my/landing-pages-index'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getMyLandingPages } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Landing Pages')

export default async function LandingPagesPage() {
  const [currentUser, pagesData] = await Promise.all([getCurrentUser(), getMyLandingPages()])

  return (
    <LandingPagesIndex
      username={currentUser?.username ?? null}
      initialPages={pagesData.results}
    />
  )
}
