import { getCurrentUser } from '@/lib/auth/get-current-user'
import { hasCreatedPost } from '@/lib/asides/activity-signals'
import { CreateFirstPostAsideContent } from './create-first-post-aside-content'

export async function CreateFirstPostAside() {
  const user = await getCurrentUser()
  if (!user) return null
  if (await hasCreatedPost(user)) return null

  return <CreateFirstPostAsideContent />
}
