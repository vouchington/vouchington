import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { TopicRecommendationForm } from '@/components/topic-recommendations/topic-recommendation-form'
import { PageWithAside } from '@/components/page-with-aside'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Create Topic Recommendation')

export default async function CreateTopicRecommendationPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const { type } = await searchParams
  const initialType = type === 'referral_program' || type === 'card' ? type : undefined

  return (
    <PageWithAside showFooter={false}>
      <div className='max-w-4xl space-y-4'>
        <div>
          <h1
            className='text-3xl font-semibold tracking-tight'
            data-pw='suggest-topic-heading'
          >
            {t('extracted.create.page.suggestATopic_65a2fcd5')}
          </h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            {t('extracted.create.page.proposeANewTopicIncludeSupporting_2c41390f')}
          </p>
        </div>
        <TopicRecommendationForm initialType={initialType} />
      </div>
    </PageWithAside>
  )
}
