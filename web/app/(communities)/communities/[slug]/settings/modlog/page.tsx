export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getCommunity, getCommunityModlog } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { CommunityModlogPanel } from '@/components/communities/community-modlog-panel'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getCommunity(slug)
  if (!data) return {}
  return createNoIndexMetadata(`Mod Log — ${data.community.name}`)
}

export default async function CommunityModlogPage({ params }: PageProps) {
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
  const isAdmin =
    currentUser.roles.includes('administrator') || currentUser.roles.includes('moderator')

  if (role !== 'owner' && role !== 'moderator' && !isAdmin) {
    notFound()
  }

  const modlogData = await getCommunityModlog(slug)

  return (
    <CommunityModlogPanel
      community={community}
      initialData={modlogData}
    />
  )
}
