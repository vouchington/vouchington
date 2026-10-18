import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestMembership } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createVoteWeightDispatchUser,
  setVoteWeightMembershipExpiryExact,
} from '@voucha/test-helpers/vote-weight-dispatch'
import { dispatchVoteWeightMembershipExpirations } from './dispatch-membership-expirations.mts'
import { voteWeightWorkConfig } from './work-limits.mts'

describe('dispatchVoteWeightMembershipExpirations', () => {
  it('pages two direct expirations in one millisecond without losing timestamp precision', async () => {
    const base = new Date(Date.UTC(2040, 5, 1) + randomInt(0, 30_000_000))
    const firstUser = await createVoteWeightDispatchUser()
    const secondUser = await createVoteWeightDispatchUser()
    const firstMembership = await createTestMembership({ user_id: firstUser.id })
    const secondMembership = await createTestMembership({ user_id: secondUser.id })
    const prefix = base
      .toISOString()
      .replace('Z', '')
      .replace(/\.\d{3}$/, '')
    await setVoteWeightMembershipExpiryExact(firstMembership.id, `${prefix}.000100Z`)
    await setVoteWeightMembershipExpiryExact(secondMembership.id, `${prefix}.000900Z`)
    const window = {
      windowStart: `${prefix}.000000Z`,
      windowEnd: `${prefix}.001000Z`,
    }
    const restore = overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, {
      dispatch_batch_size: 1,
    })
    try {
      const first = await dispatchVoteWeightMembershipExpirations({ window })
      expect(first.events).toEqual([
        {
          userId: firstUser.id,
          jobId: `voteWeight__${firstUser.id}__membershipExpired__${firstMembership.id}`,
        },
      ])
      expect(first.hasMore).toBe(true)
      expect(first.continuation?.after?.at).toContain('.0001')

      const second = await dispatchVoteWeightMembershipExpirations(first.continuation!)
      expect(second.events).toEqual([
        {
          userId: secondUser.id,
          jobId: `voteWeight__${secondUser.id}__membershipExpired__${secondMembership.id}`,
        },
      ])
      expect(second.hasMore).toBe(true)
      const short = await dispatchVoteWeightMembershipExpirations(second.continuation!)
      expect(short.events).toEqual([])
      expect(short.hasMore).toBe(false)
      expect(short.continuation).toBeNull()

      const overlap = await dispatchVoteWeightMembershipExpirations({ window })
      expect(overlap.events).toEqual(first.events)
    } finally {
      restore()
    }
  })
})
