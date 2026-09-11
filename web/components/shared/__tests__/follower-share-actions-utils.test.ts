import { describe, expect, it } from 'vitest'

import { toggleFollowerSelection } from '../follower-share-actions-utils'
import type { PublicUser } from '@/types/user'

describe('toggleFollowerSelection', () => {
  it('blocks the selection above the configured limit', () => {
    const selected = makeFollowers(100)

    expect(toggleFollowerSelection(selected, makeFollower('overflow'))).toBe(selected)
  })

  it('allows deselection at the configured limit', () => {
    const selected = makeFollowers(100)

    expect(toggleFollowerSelection(selected, selected[0]!)).toHaveLength(99)
  })
})

function makeFollowers(count: number): PublicUser[] {
  return Array.from({ length: count }, (_, index) => makeFollower(`user-${index}`))
}

function makeFollower(id: string): PublicUser {
  return { id, username: id } as PublicUser
}
