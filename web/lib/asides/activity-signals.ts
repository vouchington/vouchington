import { getUserProfile, getMyLandingPages, getMyCommunities } from '@/lib/api/server'
import type { User } from '@/types/user'

// Profile-based signals: take User because they read public getUserProfile(username).
// Session-based signals below: no User param; they call authenticated /api/v1/my/* endpoints.
// All signals return true on error so a failing API never spams the user with nudges.

// false (show nudge) when username absent: user without username cannot have posted yet.
export async function hasCreatedPost(user: User): Promise<boolean> {
  if (!user.username) return false
  return getUserProfile(user.username)
    .then(profile => {
      if (!profile) return false
      const count = profile.user_metrics?.count
      if (!count) return false
      return (count.reviews ?? 0) + (count.discussions ?? 0) + (count.comments ?? 0) > 0
    })
    .catch(() => true)
}

export async function followsAnyTopic(user: User): Promise<boolean> {
  if (!user.username) return false
  return getUserProfile(user.username)
    .then(profile => {
      if (!profile) return false
      return (profile.user_metrics?.count?.topics_following ?? 0) > 0
    })
    .catch(() => true)
}

export async function followsAnyUser(user: User): Promise<boolean> {
  if (!user.username) return false
  return getUserProfile(user.username)
    .then(profile => {
      if (!profile) return false
      return (profile.user_metrics?.count?.users_following ?? 0) > 0
    })
    .catch(() => true)
}

export async function hasLandingPage(): Promise<boolean> {
  return getMyLandingPages()
    .then(data => data.results.length > 0)
    .catch(() => true)
}

export async function hasJoinedCommunity(): Promise<boolean> {
  return getMyCommunities()
    .then(data => data.results.length > 0)
    .catch(() => true)
}
