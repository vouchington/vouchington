import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getMembership } from '@/lib/api/server'
import { UpgradeMembershipAsideContent } from './upgrade-membership-aside-content'

export async function UpgradeMembershipAside() {
  const user = await getCurrentUser()
  if (!user) return null

  const hasMembership = await getMembership()
    .then(d => d.membership?.status === 'active')
    .catch(() => true)

  if (hasMembership) return null

  return <UpgradeMembershipAsideContent />
}
