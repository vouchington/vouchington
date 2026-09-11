'use client'

import type { PublicUser } from '@/types/user'
import { MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS } from '@/lib/api/client/follower-distributions'

export type Audience = 'all_followers' | 'selected_followers'

export function toggleFollowerSelection(
  selectedFollowers: PublicUser[],
  follower: PublicUser,
): PublicUser[] {
  if (selectedFollowers.some(selected => selected.id === follower.id)) {
    return selectedFollowers.filter(selected => selected.id !== follower.id)
  }
  if (selectedFollowers.length >= MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS) {
    return selectedFollowers
  }
  return [...selectedFollowers, follower]
}
