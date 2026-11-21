import { describe, expect, it } from 'vitest'

import { toggleFollowerSelection } from '../follower-share-actions-utils'
import type { PublicUser } from '@/types/user'

describe('toggleFollowerSelection', () => {
  it('blocks the selection above the configured limit', () => {
    const selected = makeFollowers(3)

    expect(toggleFollowerSelection(selected, makeFollower('overflow'), 3)).toBe(selected)
  })

  it('allows deselection at the configured limit', () => {
    const selected = makeFollowers(3)

    expect(toggleFollowerSelection(selected, selected[0]!, 3)).toHaveLength(2)
  })

  it('applies no client-side cap until the server limit loads', () => {
    expect(toggleFollowerSelection(makeFollowers(150), makeFollower('extra'))).toHaveLength(151)
  })
})

function makeFollowers(count: number): PublicUser[] {
  return Array.from({ length: count }, (_, index) => makeFollower(`user-${index}`))
}

function makeFollower(id: string): PublicUser {
  return { id, username: id } as PublicUser
}
