export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getCommunity, getCommunityApplications, getCommunityMembers } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { ApplicationReview } from '@/components/communities/application-review'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
import { getTranslations } from '@/lib/i18n/get-translations'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getCommunity(slug)
  if (!data) return {}
  return createNoIndexMetadata(`Applications — ${data.community.name}`)
}

export default async function CommunityApplicationsPage({ params }: PageProps) {
  const t = await getTranslations()
  const { slug } = await params
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/login')
  }

  const communityData = await getCommunity(slug)

  if (!communityData) {
    notFound()
  }

  const { community, membership } = communityData
  const role = membership?.removed_at == null ? membership?.role : null

  if (role !== 'owner' && role !== 'moderator') {
    notFound()
  }

  const [applicationsData, membersData] = await Promise.all([
    getCommunityApplications(slug),
    getCommunityMembers(slug),
  ])

  return (
    <div className='space-y-6'>
      <div>
        <h2
          className='text-2xl font-bold'
          data-pw='community-applications-heading'
        >
          {t('extracted.applications.page.applications_98e33b0f')}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.applications.page.reviewMembershipApplications_e76871f5')}
        </p>
      </div>
      <ApplicationReview
        data={applicationsData}
        communitySlug={community.slug}
        users={membersData.users}
      />
    </div>
  )
}
