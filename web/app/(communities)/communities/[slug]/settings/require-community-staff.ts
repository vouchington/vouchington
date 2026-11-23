import { notFound, redirect } from 'next/navigation'
import { getCommunity } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'

/** Gate for owner/moderator settings pages: login redirect, then 404 for everyone else. */
export async function requireCommunityStaff(slug: string) {
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

  if (role !== 'owner' && role !== 'moderator') {
    notFound()
  }

  return community
}
