import { describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  currentUserCanApplyVoteRingPenalty,
  currentUserCanReviewVoteIntegrityFlags,
} from './authorization.mts'

function makeUser(roles: string[]): PrivateUser {
  return { roles } as unknown as PrivateUser
}

describe('vote-integrity authorization', () => {
  it.each([
    ['review flags', currentUserCanReviewVoteIntegrityFlags],
    ['apply vote-ring penalties', currentUserCanApplyVoteRingPenalty],
  ])('allows administrators to %s', (_description, authorize) => {
    expect(authorize(makeUser(['administrator']))).toBe(true)
  })

  it.each([
    ['review flags', currentUserCanReviewVoteIntegrityFlags],
    ['apply vote-ring penalties', currentUserCanApplyVoteRingPenalty],
  ])('rejects anonymous users attempting to %s', (_description, authorize) => {
    expect(authorize(null)).toBe(false)
  })

  it.each(['moderator', 'customer_support', 'user'])('rejects the %s role', role => {
    const user = makeUser([role])
    expect(currentUserCanReviewVoteIntegrityFlags(user)).toBe(false)
    expect(currentUserCanApplyVoteRingPenalty(user)).toBe(false)
  })
})
