import { getPrivateUserByAny } from '@services/users'
import { getUserDisplayName } from '@services/users/display-name'
import { listLandingPagesForUser } from './list.mts'
import { createMyLandingPage } from './create.mts'

export function deriveSlugFromUsername(username: string): string {
  return username.toLowerCase().replace(/_/g, '-')
}

export async function ensureDefaultLandingPage(userId: string, username: string): Promise<void> {
  const existing = await listLandingPagesForUser(userId)
  if (existing.length > 0) return

  const user = await getPrivateUserByAny(userId)
  const title = user ? getUserDisplayName(user) || username : username
  const slug = deriveSlugFromUsername(username)

  try {
    await createMyLandingPage(userId, { title, slug })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 409) return
    throw error
  }
}
