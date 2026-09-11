import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getMyBans } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { MyBansClient } from './my-bans-client'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Bans')

export default async function MyBansPage() {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const data = await getMyBans()

  return (
    <div
      className='space-y-6'
      data-pw='my-bans-page'
    >
      <SettingsPageHeader
        title={t('extracted.bans.page.myBans_7f1d40d7')}
        description={t('extracted.bans.page.activeCommunityBansOnYourAccount_3d4e5f6a')}
      />
      <MyBansClient initialData={data} />
    </div>
  )
}
