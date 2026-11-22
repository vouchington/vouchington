import { FollowContextCard } from '@/components/social/follow-context-card'
import { getTopicFollowContext } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTranslations } from '@/lib/i18n/get-translations'
import { TopicFollowerSection } from './topic-follower-section'

export default async function TopicFollowContext({ id }: { id: string }) {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) return null

  const context = await getTopicFollowContext(id)
  if (!context) return null
  const followers = context.following_topic_followers
  const hasVotes =
    context.positive_by_following.total > 0 || context.negative_by_following.total > 0
  if (!hasVotes && followers.total === 0 && followers.total_is_exact) return null

  const topicFollowersTitle = t('extracted.topics.topicFollowContext.followThisTopic_5b12931d')

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
        ...(followers.total_is_exact
          ? [
              {
                title: topicFollowersTitle,
                data: followers,
                emptyLabel: t(
                  'extracted.topics.topicFollowContext.noFollowedUsersFollowThisTopic_25a8aed7',
                ),
              },
            ]
          : []),
      ]}
      extraSection={
        !followers.total_is_exact && (
          <TopicFollowerSection
            key={id}
            topicId={id}
            title={topicFollowersTitle}
            initialPage={{
              total: followers.total,
              users: followers.users,
              next_cursor: followers.next_cursor,
            }}
          />
        )
      }
    />
  )
}
