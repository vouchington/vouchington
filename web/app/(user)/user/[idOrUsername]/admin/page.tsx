import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getUserProfile } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getAdminLandingPagesForUser } from '@/lib/api/server/admin-landing-pages'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { UserAdminPanel } from './user-admin-panel'
import { MembershipRefundPanel } from './membership-refund-panel'
import { LandingPageAnalyticsCard } from './landing-page-analytics-card'

interface PageProps {
  params: Promise<{ idOrUsername: string }>
}

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('User Admin')

export default async function UserAdminPage({ params }: PageProps) {
  const currentUser = await getCurrentUser()
  const isAdmin = currentUser?.roles.includes('administrator') ?? false

  if (!currentUser || !isAdmin) {
    notFound()
  }

  const { idOrUsername } = await params
  const profileData = await getUserProfile(idOrUsername)
  if (!profileData) {
    notFound()
  }

  let landingPagesData: Awaited<ReturnType<typeof getAdminLandingPagesForUser>> = null
  let showLandingPageAnalytics = false
  if (isAdmin) {
    try {
      landingPagesData = await getAdminLandingPagesForUser(profileData.user.id)
      showLandingPageAnalytics = landingPagesData !== null
    } catch (error) {
      console.error('Failed to load admin landing pages:', error)
    }
  }

  return (
    <div
      key={profileData.user.id}
      className='space-y-6'
    >
      {isAdmin && <UserAdminPanel user={profileData.user} />}
      {showLandingPageAnalytics && (
        <LandingPageAnalyticsCard landingPages={landingPagesData?.results ?? []} />
      )}
      <MembershipRefundPanel
        actorUserId={currentUser.id}
        userId={profileData.user.id}
      />
    </div>
  )
}
