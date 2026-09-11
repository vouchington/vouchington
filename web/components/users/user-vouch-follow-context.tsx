import { FollowContextCard } from '@/components/social/follow-context-card'
import { getUserVouchContext } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTranslations } from '@/lib/i18n/get-translations'

function hasFollowContext(totalValues: number[]): boolean {
  return totalValues.some(total => total > 0)
}

export default async function UserVouchFollowContext({ id }: { id: string }) {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) return null

  const context = await getUserVouchContext(id)
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
      title={t('extracted.users.userVouchFollowContext.fromPeopleYouFollow_b18bce42')}
      sections={[
        {
          title: t('extracted.users.userVouchFollowContext.positiveSignalsForThisUser_fc1a9005'),
          data: context.positive_by_following,
          emptyLabel: t(
            'extracted.users.userVouchFollowContext.noFollowedUsersLeftAPositiveSignal_93abd46c',
          ),
        },
        {
          title: t('extracted.users.userVouchFollowContext.negativeSignalsForThisUser_19e5e2df'),
          data: context.negative_by_following,
          emptyLabel: t(
            'extracted.users.userVouchFollowContext.noFollowedUsersLeftANegativeSignal_7121da44',
          ),
        },
      ]}
    />
  )
}
