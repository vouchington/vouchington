import { getCurrentUser } from '@/lib/auth/get-current-user'
import { followsAnyTopic } from '@/lib/asides/activity-signals'
import { FollowTopicsAsideContent } from './follow-topics-aside-content'

export async function FollowTopicsAside() {
  const user = await getCurrentUser()
  if (!user) return null
  if (await followsAnyTopic(user)) return null

  return <FollowTopicsAsideContent />
}
