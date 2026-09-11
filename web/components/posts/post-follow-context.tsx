import { FollowContextCard } from '@/components/social/follow-context-card'
import { getPostFollowContext } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTranslations } from '@/lib/i18n/get-translations'

function hasFollowContext(totalValues: number[]): boolean {
  return totalValues.some(total => total > 0)
}

export default async function PostFollowContext({ id }: { id: string }) {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) return null

  const context = await getPostFollowContext(id)
  if (!context) return null
  if (
    !hasFollowContext([
      context.positive_by_following?.total ?? 0,
      context.negative_by_following?.total ?? 0,
    ])
  ) {
    return null
  }

  return (
    <FollowContextCard
      title={t('extracted.posts.postFollowContext.fromPeopleYouFollow_b18bce42')}
      sections={[
        {
          title: t('extracted.posts.postFollowContext.positiveSignalsForThisPost_d8f42fe5'),
          data: context.positive_by_following,
          emptyLabel: t(
            'extracted.posts.postFollowContext.noFollowedUsersLeftAPositiveSignalForThis_2fd3c41d',
          ),
        },
        {
          title: t('extracted.posts.postFollowContext.negativeSignalsForThisPost_58b3d283'),
          data: context.negative_by_following,
          emptyLabel: t(
            'extracted.posts.postFollowContext.noFollowedUsersLeftANegativeSignalForThis_a138e433',
          ),
        },
      ]}
    />
  )
}
