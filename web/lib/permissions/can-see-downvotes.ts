import type { User } from '@/types/user'

/**
 * Mirrors backend/services/elections-votes/shared/sanitize-election.mts:canSeeDownvotes.
 * Controls whether the downvote count span is rendered on UGC surfaces (posts, comments).
 * Non-UGC content (topics, hostnames, RSS feed items, entity relations) shows counts to all users.
 */
export function canCurrentUserSeeDownvotes(currentUser: User | null): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.membership_plan != null
}
