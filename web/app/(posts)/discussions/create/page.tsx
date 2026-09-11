import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getUrlsByIds, getMyContributionStatus, getTopic } from '@/lib/api/server'
import { PostForm } from '@/components/posts/post-form'
import { ContributionGatedCta } from '@/components/posts/contribution-gated-cta'
import { isContributionGated } from '@/components/posts/contribution-status'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'
import { PostsDiscoveryAside } from '@/components/asides/posts-discovery-aside'
import { getEligibleCommunityPostOptions } from '@/components/posts/post-form/community-options'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('New Discussion')

interface CreateDiscussionPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CreateDiscussionPage({ searchParams }: CreateDiscussionPageProps) {
  const t = await getTranslations()
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const rawUrlIds = typeof params.related_url_ids === 'string' ? params.related_url_ids : ''
  const requestedCommunitySlug = typeof params.community === 'string' ? params.community : undefined
  const urlIds = rawUrlIds
    .split(',')
    .flatMap(id => (id.trim() ? [id.trim()] : []))
    .slice(0, 20)

  const topicId = typeof params.topic_id === 'string' ? params.topic_id : undefined

  const [initialRelatedUrls, contributionData, topicData, communityData] = await Promise.all([
    urlIds.length > 0 ? getUrlsByIds(urlIds) : Promise.resolve([]),
    getMyContributionStatus({ action: 'discussion' }).catch(() => null),
    topicId ? getTopic(topicId).catch(() => null) : Promise.resolve(null),
    getEligibleCommunityPostOptions('discussion', requestedCommunitySlug),
  ])

  const isGated = isContributionGated(contributionData)

  const topic = topicData?.topic
  const initialDiscussionCategories = topic ? [{ id: topic.id, name: topic.name }] : undefined

  return (
    <PageWithAside
      aside={PostsDiscoveryAside}
      showFooter={false}
    >
      <div className='max-w-2xl space-y-4'>
        <h1 className='text-2xl font-bold'>{t('extracted.create.page.newDiscussion_639bd43d')}</h1>
        {isGated ? (
          <ContributionGatedCta
            status={contributionData.contribution_status}
            admission={contributionData.admission}
            actionNoun={t('extracted.create.page.startADiscussion_136138e7')}
          />
        ) : (
          <PostForm
            postType='discussion'
            initialRelatedUrls={initialRelatedUrls}
            initialDiscussionCategories={initialDiscussionCategories}
            communityOptions={communityData.communityOptions}
            initialCommunitySlug={communityData.initialCommunitySlug}
          />
        )}
      </div>
    </PageWithAside>
  )
}
