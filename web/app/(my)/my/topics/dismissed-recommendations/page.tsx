import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { UserTopicRelationRoute } from '@/components/users/user-relation-route-pages'
import { USER_RELATION_ACTIONS } from '@/components/users/user-relation-actions'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Dismissed Topic Recommendations')

export default async function MyTopicsDismissedRecommendationsPage() {
  const t = await getTranslations()
  const currentUser = await requireCurrentUser()
  return (
    <div
      className='space-y-6'
      data-pw='my-topics-dismissed-recommendations-page'
    >
      <SettingsPageHeader
        title={t(
          'extracted.dismissedRecommendations.page.myDismissedTopicRecommendations_f27a11dc',
        )}
        description={t(
          'extracted.dismissedRecommendations.page.topicRecommendationsYouHaveDismissed_92a3b4c5',
        )}
      />
      <UserTopicRelationRoute
        idOrUsername={currentUser.id}
        listType='dismissed-recommendations'
        emptyTitle={t(
          'extracted.dismissedRecommendations.page.noDismissedTopicRecommendations_a3b4c5d6',
        )}
        emptyDescription={t(
          'extracted.dismissedRecommendations.page.youHaveNotDismissedAnyTopicRecommendations_b4c5d6e7',
        )}
        relationAction={USER_RELATION_ACTIONS.topic.dismissed}
      />
    </div>
  )
}
