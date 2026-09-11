import { getCurrentUser } from '@/lib/auth/get-current-user'
import { hasLandingPage } from '@/lib/asides/activity-signals'
import { CreateLandingPageAsideContent } from './create-landing-page-aside-content'

export async function CreateLandingPageAside() {
  const user = await getCurrentUser()
  if (!user) return null
  if (await hasLandingPage()) return null
  return <CreateLandingPageAsideContent />
}
