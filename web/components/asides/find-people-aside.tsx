import { getCurrentUser } from '@/lib/auth/get-current-user'
import { followsAnyUser } from '@/lib/asides/activity-signals'
import { FindPeopleAsideContent } from './find-people-aside-content'

export async function FindPeopleAside() {
  const user = await getCurrentUser()
  if (!user) return null
  if (await followsAnyUser(user)) return null
  return <FindPeopleAsideContent />
}
