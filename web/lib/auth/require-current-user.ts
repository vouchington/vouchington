import { redirect } from 'next/navigation'
import { getCurrentUser } from './get-current-user'
import type { User } from '@/types/user'

/**
 * Centralized auth utility for server components that require the current user.
 *
 * Redirects to `/login` without `?next=` because the (my) layout redirect races
 * per-page redirects. After sign-in the user lands on `/`, not the originally
 * requested page. Callers that need return-URL preservation should not use this helper.
 */
export async function requireCurrentUser(): Promise<User> {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  return currentUser
}
