export const dynamic = 'force-dynamic'

import { getCommunity, getCommunityApplications } from '@/lib/api/server'
import { ApplicationReview } from '@/components/communities/application-review'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
import { getTranslations } from '@/lib/i18n/get-translations'
import { requireCommunityStaff } from '../require-community-staff'

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
  const community = await requireCommunityStaff(slug)
  const applicationsData = await getCommunityApplications(slug)

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
      />
    </div>
  )
}
