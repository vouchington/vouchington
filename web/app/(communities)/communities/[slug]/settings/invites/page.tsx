export const dynamic = 'force-dynamic'

import { getCommunity, getCommunityInvites } from '@/lib/api/server'
import { InviteManager } from '@/components/communities/invite-manager'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
import { getTranslations } from '@/lib/i18n/get-translations'
import { requireCommunityStaff } from '../require-community-staff'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getCommunity(slug)
  if (!data) return {}
  return createNoIndexMetadata(`Invites — ${data.community.name}`)
}

export default async function CommunityInvitesPage({ params }: PageProps) {
  const t = await getTranslations()
  const { slug } = await params
  const community = await requireCommunityStaff(slug)
  const invitesData = await getCommunityInvites(slug)

  return (
    <div className='space-y-6'>
      <div>
        <h2
          className='text-2xl font-bold'
          data-pw='community-invites-heading'
        >
          {t('extracted.invites.page.invites_f212a985')}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.invites.page.sendAndManageInvitations_79c4fb7f')}
        </p>
      </div>
      <InviteManager
        data={invitesData}
        communitySlug={community.slug}
      />
    </div>
  )
}
