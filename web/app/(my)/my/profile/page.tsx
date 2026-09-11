export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { Separator } from '@/components/ui/separator'

export const metadata: Metadata = createNoIndexMetadata('Profile')
import { getMyProfile, getMyProfileLinks } from '@/lib/api/server'
import { ProfileForm } from '@/components/my/profile-form'
import { ProfileLinks } from '@/components/my/profile-links'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getTranslations } from '@/lib/i18n/get-translations'

export default async function ProfilePage() {
  const t = await getTranslations()
  const [profileData, linksData] = await Promise.all([getMyProfile(), getMyProfileLinks()])
  const { profile } = profileData

  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.profile.page.profile_d696a35b')}
        description={t('extracted.profile.page.yourPublicProfileShownToOtherUsers_5e6f7081')}
      />

      <ProfileForm initialMarkdown={profile.markdown} />

      <Separator />

      <ProfileLinks initialLinks={linksData.results} />
    </div>
  )
}
