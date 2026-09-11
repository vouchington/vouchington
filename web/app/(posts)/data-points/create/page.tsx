import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getMyFinancialProfile, getMyContributionStatus, getTopic } from '@/lib/api/server'
import { PostForm } from '@/components/posts/post-form'
import { ContributionGatedCta } from '@/components/posts/contribution-gated-cta'
import { isContributionGated } from '@/components/posts/contribution-status'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'
import { PostsDiscoveryAside } from '@/components/asides/posts-discovery-aside'
import { toDataPointTopic } from '@/components/posts/post-form/initial-state'
import { getEligibleCommunityPostOptions } from '@/components/posts/post-form/community-options'
import { isOfficialAccount } from '@/lib/auth/official-account'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('New Data Point')

interface CreateDataPointPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CreateDataPointPage({ searchParams }: CreateDataPointPageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const topicId = typeof params.topic_id === 'string' ? params.topic_id : undefined
  const requestedCommunitySlug = typeof params.community === 'string' ? params.community : undefined

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [financialProfileData, contributionData, topicData, communityData] = await Promise.all([
    getMyFinancialProfile().catch(() => null),
    getMyContributionStatus({ action: 'data_point' }).catch(() => null),
    topicId ? getTopic(topicId).catch(() => null) : Promise.resolve(null),
    getEligibleCommunityPostOptions('data_point', requestedCommunitySlug),
  ])

  const isOfficial = isOfficialAccount(user)
  const isGated = isContributionGated(contributionData)

  const initialDataPointTopic = topicData ? toDataPointTopic(topicData.topic) : undefined

  return (
    <PageWithAside
      aside={PostsDiscoveryAside}
      showFooter={false}
    >
      <div className='max-w-2xl space-y-4'>
        <h1
          className='text-2xl font-bold'
          data-pw='new-data-point-heading'
        >
          {t('extracted.create.page.newDataPoint_e87814dd')}
        </h1>
        {isOfficial ? (
          <p
            className='text-sm text-muted-foreground'
            data-pw='official-account-data-point-gate'
          >
            {t('extracted.create.page.officialAccountsCannotShareCommunityData_2e40c7fd')}
          </p>
        ) : isGated ? (
          <ContributionGatedCta
            status={contributionData.contribution_status}
            admission={contributionData.admission}
            actionNoun={t('extracted.create.page.shareADataPoint_83c66a78')}
          />
        ) : (
          <PostForm
            postType='data_point'
            userFinancialProfile={financialProfileData?.financial_profile ?? null}
            initialDataPointTopic={initialDataPointTopic}
            communityOptions={communityData.communityOptions}
            initialCommunitySlug={communityData.initialCommunitySlug}
          />
        )}
      </div>
    </PageWithAside>
  )
}
