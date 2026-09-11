export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getCommunity } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { CommunitySettingsForm } from '@/components/communities/community-settings-form'
import { createCommunityPathname } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
import { getTranslations } from '@/lib/i18n/get-translations'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getCommunity(slug)
  if (!data) return {}
  return createNoIndexMetadata(`Settings — ${data.community.name}`)
}

export default async function CommunitySettingsPage({ params }: PageProps) {
  const t = await getTranslations()
  const { slug } = await params
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/login')
  }

  const communityData = await getCommunity(slug)

  if (!communityData) {
    notFound()
  }

  const { community, membership } = communityData
  const role = membership?.removed_at == null ? membership?.role : null

  if (role === 'moderator') {
    redirect(createCommunityPathname(slug, '/settings/moderation'))
  }

  if (role !== 'owner') {
    notFound()
  }

  return (
    <div className='space-y-4'>
      <div>
        <h2
          className='text-2xl font-bold'
          data-pw='community-settings-heading'
        >
          {t('extracted.settings.page.communitySettings_d941dd88')}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.settings.page.manageYourCommunityConfiguration_8ecce5a0')}
        </p>
      </div>
      <CommunitySettingsForm community={community} />
    </div>
  )
}
