import { FollowContextCard } from '@/components/social/follow-context-card'
import { getTopicFollowContext } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTranslations } from '@/lib/i18n/get-translations'

function hasFollowContext(totalValues: number[]): boolean {
  return totalValues.some(total => total > 0)
}

export default async function TopicFollowContext({ id }: { id: string }) {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) return null

  const context = await getTopicFollowContext(id)
  if (!context) return null
  if (
    !hasFollowContext([
      context.positive_by_following?.total ?? 0,
      context.negative_by_following?.total ?? 0,
      context.following_topic_followers?.total ?? 0,
    ])
  ) {
    return null
  }

  return (
    <FollowContextCard
      title={t('extracted.topics.topicFollowContext.fromPeopleYouFollow_b18bce42')}
      sections={[
        {
          title: t('extracted.topics.topicFollowContext.positiveSignalsForThisTopic_a4338781'),
          data: context.positive_by_following,
          emptyLabel: t(
            'extracted.topics.topicFollowContext.noFollowedUsersLeftAPositiveSignalForThis_48c0c962',
          ),
        },
        {
          title: t('extracted.topics.topicFollowContext.negativeSignalsForThisTopic_d8ffd099'),
          data: context.negative_by_following,
          emptyLabel: t(
            'extracted.topics.topicFollowContext.noFollowedUsersLeftANegativeSignalForThis_d22b1c9b',
          ),
        },
        {
          title: t('extracted.topics.topicFollowContext.followThisTopic_5b12931d'),
          data: context.following_topic_followers,
          emptyLabel: t(
            'extracted.topics.topicFollowContext.noFollowedUsersFollowThisTopic_25a8aed7',
          ),
        },
      ]}
    />
  )
}
