import { getCurrentUser } from '@/lib/auth/get-current-user'
import { hasJoinedCommunity } from '@/lib/asides/activity-signals'
import { PopularCommunitiesAside } from './popular-communities-aside'

export async function DiscoverCommunitiesAside() {
  const user = await getCurrentUser()
  if (!user) return null
  if (await hasJoinedCommunity()) return null
  return <PopularCommunitiesAside />
}
