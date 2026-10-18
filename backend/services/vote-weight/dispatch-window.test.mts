import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createVoteWeightDispatchUserAt } from '@voucha/test-helpers/vote-weight-dispatch'
import { getVoteWeightDispatchWindow } from './dispatch-window.mts'
import { dispatchVoteWeightAgeMilestones } from './dispatch-age-milestones.mts'
import { voteWeightWorkConfig } from './work-limits.mts'

describe('vote-weight lookback', () => {
  it('includes changes inside its lookback and ignores older changes; expanding it recovers an outage', async () => {
    const now = new Date(Date.UTC(2200, 0, 1) + randomInt(0, 1000000000))
    const older = await createVoteWeightDispatchUserAt(new Date(now.getTime() - 120000))
    const recent = await createVoteWeightDispatchUserAt(new Date(now.getTime() - 30000))
    const restore = overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, {
      age_milestones_lookback_seconds: 60,
    })
    try {
      const first = await dispatchVoteWeightAgeMilestones({
        window: getVoteWeightDispatchWindow('age_milestones', now),
      })
      expect(first.events.map(row => row.userId)).toContain(recent)
      expect(first.events.map(row => row.userId)).not.toContain(older)
      const restoreExpanded = overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, {
        age_milestones_lookback_seconds: 180,
      })
      try {
        const recovered = await dispatchVoteWeightAgeMilestones({
          window: getVoteWeightDispatchWindow('age_milestones', now),
        })
        expect(recovered.events.map(row => row.userId)).toEqual(
          expect.arrayContaining([older, recent]),
        )
      } finally {
        restoreExpanded()
      }
    } finally {
      restore()
    }
  })
})
