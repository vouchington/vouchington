import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getMyContributionStatus, getTopic } from '@/lib/api/server'
import { PostForm } from '@/components/posts/post-form'
import { ContributionGatedCta } from '@/components/posts/contribution-gated-cta'
import { isContributionGated } from '@/components/posts/contribution-status'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'
import { PostsDiscoveryAside } from '@/components/asides/posts-discovery-aside'
import { getEligibleCommunityPostOptions } from '@/components/posts/post-form/community-options'
import { isOfficialAccount } from '@/lib/auth/official-account'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('New Review')

interface CreateReviewPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CreateReviewPage({ searchParams }: CreateReviewPageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const topicId = typeof params.topic_id === 'string' ? params.topic_id : undefined
  const requestedCommunitySlug = typeof params.community === 'string' ? params.community : undefined

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [contributionData, topicData, communityData] = await Promise.all([
    getMyContributionStatus({ action: 'review' }).catch(() => null),
    topicId ? getTopic(topicId).catch(() => null) : Promise.resolve(null),
    getEligibleCommunityPostOptions('review', requestedCommunitySlug),
  ])

  const isOfficial = isOfficialAccount(user)
  const isGated = isContributionGated(contributionData)

  const topic = topicData?.topic
  const initialReviewTopic = topic?.allow_reviews ? { id: topic.id, name: topic.name } : undefined

  return (
    <PageWithAside
      aside={PostsDiscoveryAside}
      showFooter={false}
    >
      <div className='max-w-2xl space-y-4'>
        <h1
          className='text-2xl font-bold'
          data-pw='new-review-heading'
        >
          {t('extracted.create.page.newReview_629540a6')}
        </h1>
        {isOfficial ? (
          <p
            className='text-sm text-muted-foreground'
            data-pw='official-account-review-gate'
          >
            {t('extracted.create.page.officialAccountsCannotWriteCommunityReviews_a8e258ce')}
          </p>
        ) : isGated ? (
          <ContributionGatedCta
            status={contributionData.contribution_status}
            admission={contributionData.admission}
            actionNoun={t('extracted.create.page.writeAReview_c47c72ec')}
          />
        ) : (
          <PostForm
            postType='review'
            isAdmin={user.roles.includes('administrator')}
            initialReviewTopic={initialReviewTopic}
            communityOptions={communityData.communityOptions}
            initialCommunitySlug={communityData.initialCommunitySlug}
          />
        )}
      </div>
    </PageWithAside>
  )
}
