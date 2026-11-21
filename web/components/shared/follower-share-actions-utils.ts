'use client'

import type { PublicUser } from '@/types/user'

export type Audience = 'all_followers' | 'selected_followers'

export function toggleFollowerSelection(
  selectedFollowers: PublicUser[],
  follower: PublicUser,
  maxSelected?: number,
): PublicUser[] {
  if (selectedFollowers.some(selected => selected.id === follower.id)) {
    return selectedFollowers.filter(selected => selected.id !== follower.id)
  }
  if (maxSelected !== undefined && selectedFollowers.length >= maxSelected) {
    return selectedFollowers
  }
  return [...selectedFollowers, follower]
}
