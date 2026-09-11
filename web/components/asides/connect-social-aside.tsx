import { getCurrentUser } from '@/lib/auth/get-current-user'
import { ConnectSocialAsideContent } from './connect-social-aside-content'

export async function ConnectSocialAside() {
  const user = await getCurrentUser()
  if (!user) return null

  const connectedCount = [
    user.facebook_account,
    user.apple_account,
    user.google_account,
    user.x_account,
    user.linkedin_account,
    user.microsoft_account,
    user.github_account,
  ].filter(Boolean).length

  if (connectedCount >= 3) return null

  return <ConnectSocialAsideContent />
}
