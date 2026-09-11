export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LandingPageEditor } from '@/components/my/landing-page-editor'
import { LandingPagesUsernameRequired } from '@/components/my/landing-pages-manager-sections'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getMyLandingPage, getMyLandingPageCandidates, getMyLandingPages } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Edit Landing Page')

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function LandingPageEditorPage({ params }: PageProps) {
  const { slug } = await params

  const [currentUser, pagesData] = await Promise.all([getCurrentUser(), getMyLandingPages()])

  if (!currentUser) notFound()
  if (!currentUser.username) return <LandingPagesUsernameRequired />

  const pageRow = pagesData.results.find(p => p.slug === slug)
  if (!pageRow) notFound()

  const [pageDetail, candidatesData] = await Promise.all([
    getMyLandingPage(pageRow.id),
    getMyLandingPageCandidates(),
  ])

  return (
    <LandingPageEditor
      initialPage={pageDetail.landing_page}
      candidates={candidatesData.candidates}
      username={currentUser.username}
    />
  )
}
