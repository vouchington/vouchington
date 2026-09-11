import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { FindFriendsTabs } from '@/components/my/find-friends-tabs'
import { getTranslations } from '@/lib/i18n/get-translations'

export default async function FindFriendsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations()
  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.friendRecommendations.layout.findFriends_d4864039')}
      />
      <FindFriendsTabs />
      {children}
    </div>
  )
}
