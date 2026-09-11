import { FollowContextCard } from '@/components/social/follow-context-card'
import { getRssFeedItemFollowContext } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTranslations } from '@/lib/i18n/get-translations'

function hasFollowContext(totalValues: number[]): boolean {
  return totalValues.some(total => total > 0)
}

export default async function RssFeedItemFollowContext({ id }: { id: string }) {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) return null

  const context = await getRssFeedItemFollowContext(id)
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
      title={t('extracted.rssFeedItems.rssFeedItemFollowContext.fromPeopleYouFollow_b18bce42')}
      sections={[
        {
          title: t(
            'extracted.rssFeedItems.rssFeedItemFollowContext.positiveSignalsForThisItem_73deb257',
          ),
          data: context.positive_by_following,
          emptyLabel: t(
            'extracted.rssFeedItems.rssFeedItemFollowContext.noFollowedUsersLeftAPositiveSignalForThis_7ad7df83',
          ),
        },
        {
          title: t(
            'extracted.rssFeedItems.rssFeedItemFollowContext.negativeSignalsForThisItem_400ea04a',
          ),
          data: context.negative_by_following,
          emptyLabel: t(
            'extracted.rssFeedItems.rssFeedItemFollowContext.noFollowedUsersLeftANegativeSignalForThis_7cda8738',
          ),
        },
      ]}
    />
  )
}
