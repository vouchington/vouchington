import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTopicRecommendation } from '@/lib/api/server/topic-recommendations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { TopicRecommendationForm } from '@/components/topic-recommendations/topic-recommendation-form'
import { PageWithAside } from '@/components/page-with-aside'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Edit Topic Recommendation')

export default async function EditTopicRecommendationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const { id } = await params
  const data = await getTopicRecommendation(id)
  if (
    !data?.post ||
    data.post.post_type !== 'topic_recommendation' ||
    !data.post.topic_recommendation
  ) {
    notFound()
  }

  const canEdit =
    currentUser.roles.includes('administrator') || data.post.created_by_id === currentUser.id
  if (!canEdit || data.post.topic_recommendation.status !== 'pending') {
    redirect('/topic-recommendations')
  }

  return (
    <PageWithAside showFooter={false}>
      <div className='max-w-4xl space-y-4'>
        <div>
          <h1 className='text-3xl font-semibold tracking-tight'>
            {t('extracted.edit.page.editTopicRecommendation_8b5d2924')}
          </h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            {t('extracted.edit.page.updateTheProposalWhileItIs_c8d77b56')}
          </p>
        </div>
        <TopicRecommendationForm recommendation={data.post} />
      </div>
    </PageWithAside>
  )
}
