export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getCommunity, getCommunityMembers } from '@/lib/api/server'
import { CommunityMembersManager } from '@/components/communities/community-members-manager'
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
  return createNoIndexMetadata(`Members — ${data.community.name}`)
}

export default async function CommunityMembersPage({ params }: PageProps) {
  const t = await getTranslations()
  const { slug } = await params
  const communityData = await getCommunity(slug)

  if (!communityData || communityData.has_pending_application) {
    notFound()
  }

  const membersData = await getCommunityMembers(slug)

  return (
    <>
      <h1 className='sr-only'>
        {t('extracted.members.page.membersCommunityname_4e563d67', {
          communityName: communityData.community.name,
        })}
      </h1>
      <CommunityMembersManager
        community={communityData.community}
        currentUserMembership={communityData.membership}
        data={membersData}
      />
    </>
  )
}
