import { redirect } from 'next/navigation'
import { getCurrentUser } from './get-current-user'
import type { User } from '@/types/user'

/**
 * Server-side admin authorization gate.
 *
 * Entity-scoped pages live under their entity route (e.g. `/topics/create`,
 * `/referral-program/:id/validations`, `/crawler/:id`) rather than `/admin/**`,
 * so they no longer inherit the admin gate from `app/admin/layout.tsx`. Call this
 * at the top of any such server component (page or layout) to re-establish the
 * gate: a non-administrator (or signed-out user) is redirected to `/`.
 *
 * Admin-only is an authorization concern enforced here — not a URL-namespace concern.
 */
export async function requireAdmin(): Promise<User> {
  const currentUser = await getCurrentUser()
  if (!currentUser || !currentUser.roles.includes('administrator')) {
    redirect('/')
  }
  return currentUser
}
