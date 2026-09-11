import type { ViewBaseElection } from '@voucha/types/entities/election'
import type { PrivateUser } from '@services/users/types'
import { isAdminUser } from '@services/users'

/**
 * Returns true if the user can see downvote counts (paid member or admin).
 * All signed-in users can cast downvotes — this controls visibility only.
 * Uses membership_plan from view_users_private to avoid an extra DB call.
 *
 * Downvote visibility restriction applies to posts (UGC) only.
 * Non-UGC content (topics, hostnames, RSS feed items, entity relations) shows
 * downvote counts to all users without sanitization.
 */
export function canSeeDownvotes(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  if (isAdminUser(currentUser)) return true
  return currentUser.membership_plan != null
}

/**
 * Strips downvote data from a single election for non-paid users.
 * Hides the restricted negative voter count while preserving the aggregate net score.
 */
export function sanitizeElectionForFreeUser<T extends ViewBaseElection>(election: T): T {
  return {
    ...election,
    votes_count_down: 0,
  }
}

/**
 * Strips downvote data from a record of elections for non-paid users.
 */
export function sanitizeElectionsRecordForFreeUser<T extends ViewBaseElection>(
  elections: Record<string, T>,
): Record<string, T> {
  const result: Record<string, T> = {}
  for (const [key, election] of Object.entries(elections)) {
    result[key] = sanitizeElectionForFreeUser(election)
  }
  return result
}

/**
 * Conditionally sanitizes a single election based on the user's membership.
 */
export function maybeSanitizeElection<T extends ViewBaseElection>(
  currentUser: PrivateUser | null,
  election: T | null,
): T | null {
  if (!election) return null
  if (canSeeDownvotes(currentUser)) return election
  return sanitizeElectionForFreeUser(election)
}

/**
 * Conditionally sanitizes a record of elections based on the user's membership.
 */
export function maybeSanitizeElections<T extends ViewBaseElection>(
  currentUser: PrivateUser | null,
  elections: Record<string, T>,
): Record<string, T> {
  if (canSeeDownvotes(currentUser)) return elections
  return sanitizeElectionsRecordForFreeUser(elections)
}
