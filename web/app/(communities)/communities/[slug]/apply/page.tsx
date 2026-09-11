export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getCommunity, getCommunityApplicationQuestions } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { ApplicationForm } from '@/components/communities/application-form'
import { Button } from '@/components/ui/button'
import { communityHref } from '@/lib/links/entity-href'
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
  return createNoIndexMetadata(`Apply — ${data.community.name}`)
}

export default async function CommunityApplyPage({ params }: PageProps) {
  const t = await getTranslations()
  const { slug } = await params
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/login')
  }

  const [communityData, questionsData] = await Promise.all([
    getCommunity(slug),
    getCommunityApplicationQuestions(slug),
  ])

  if (!communityData) {
    notFound()
  }

  const { community, membership } = communityData
  const hasPendingApplication = communityData.has_pending_application ?? false

  // Already a member
  if (membership && !membership.removed_at) {
    redirect(communityHref({ slug }))
  }

  // Already has a pending application
  if (hasPendingApplication) {
    return (
      <div className='max-w-xl space-y-4'>
        <div>
          <h1 className='text-2xl font-bold'>{community.name}</h1>
          <p className='mt-1 text-muted-foreground'>
            {t('extracted.apply.page.yourApplicationIsPendingReview_baaff07f')}
          </p>
        </div>
        <Button
          size='touchSm'
          variant='outline'
          disabled
          data-pw='apply-page-pending-button'
        >
          {t('extracted.apply.page.applicationPending_07bf3b11')}
        </Button>
      </div>
    )
  }

  return (
    <div className='max-w-xl space-y-4'>
      <div>
        <h1 className='text-2xl font-bold'>
          {t('extracted.apply.page.applyToJoinCommunityname_bb70bc63', {
            communityName: community.name,
          })}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.apply.page.completeTheFormBelowToSubmit_b8b71ef9')}
        </p>
      </div>
      <ApplicationForm
        communitySlug={community.slug}
        questions={questionsData?.questions ?? []}
      />
    </div>
  )
}
