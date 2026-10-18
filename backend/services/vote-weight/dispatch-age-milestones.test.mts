import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createVoteWeightDispatchUserAt } from '@voucha/test-helpers/vote-weight-dispatch'
import { dispatchVoteWeightAgeMilestones } from './dispatch-age-milestones.mts'
import { voteWeightWorkConfig } from './work-limits.mts'

describe('dispatchVoteWeightAgeMilestones', () => {
  it('pages an owned birth-millisecond range and reuses the event id on overlap', async () => {
    const start = new Date(Date.UTC(2040, 0, 1) + randomInt(0, 30_000_000))
    const userId = await createVoteWeightDispatchUserAt(start)
    const window = {
      windowStart: start.toISOString(),
      windowEnd: new Date(start.getTime() + 1).toISOString(),
    }
    const restore = overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, {
      dispatch_batch_size: 1,
    })
    try {
      const full = await dispatchVoteWeightAgeMilestones({ window, milestoneIndex: 0 })
      expect(full.events).toEqual([{ userId, jobId: `voteWeight__${userId}__age__0` }])
      expect(full.hasMore).toBe(true)
      expect(full.continuation).toEqual({ window, milestoneIndex: 0, afterId: userId })

      const short = await dispatchVoteWeightAgeMilestones(full.continuation!)
      expect(short.events).toEqual([])
      expect(short.continuation).toEqual({ window, milestoneIndex: 1 })

      const overlap = await dispatchVoteWeightAgeMilestones({ window, milestoneIndex: 0 })
      expect(overlap.events).toEqual(full.events)
    } finally {
      restore()
    }
  })
})
