import { randomInt } from 'node:crypto'
import { v7 } from 'uuid'
import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  withVoteWeightDispatchCursorForTest,
  readVoteWeightDispatchCursorForTest,
  createVoteWeightDispatchUserAt,
} from '@voucha/test-helpers/vote-weight-dispatch'
import { beginVoteWeightDispatch, completeVoteWeightDispatch } from './dispatch-cursor.mts'
import { dispatchVoteWeightAgeMilestones } from './dispatch-age-milestones.mts'
import { voteWeightWorkConfig } from './work-limits.mts'

describe('completeVoteWeightDispatch', () => {
  it('advances a completed window and rejects a concurrent stale completion', async () => {
    await withVoteWeightDispatchCursorForTest(
      'family_source_changes',
      async (previousThroughAt, query) => {
        const windowEnd = new Date(
          Math.max(
            new Date(previousThroughAt ?? '2000-01-01').getTime(),
            new Date('2040-01-01').getTime(),
          ) + 1_000,
        ).toISOString()
        const window = { previousThroughAt, windowStart: previousThroughAt, windowEnd }
        await completeVoteWeightDispatch('family_source_changes', window, { query })
        const advanced = await readVoteWeightDispatchCursorForTest('family_source_changes', query)
        expect(new Date(advanced!).toISOString()).toBe(windowEnd)
        await completeVoteWeightDispatch(
          'family_source_changes',
          { ...window, windowEnd: '2099-01-01T00:00:00Z' },
          { query },
        )
        expect(await readVoteWeightDispatchCursorForTest('family_source_changes', query)).toBe(
          advanced,
        )
      },
    )
  })

  it('lets an operator replay an old eligible user without rewinding the committed cursor', async () => {
    const bornAt = new Date(Date.UTC(2100, 0, 1) + randomInt(0, 30_000_000))
    const userId = await createVoteWeightDispatchUserAt(bornAt)
    const restore = overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, {
      dispatch_batch_size: 1,
    })
    try {
      await withVoteWeightDispatchCursorForTest(
        'age_milestones',
        async (previousThroughAt, query) => {
          const cursorAt = new Date(
            Math.max(Date.UTC(2200, 0, 1), new Date(previousThroughAt ?? '2000-01-01').getTime()) +
              1_000,
          )
          await completeVoteWeightDispatch(
            'age_milestones',
            { previousThroughAt, windowStart: null, windowEnd: cursorAt.toISOString() },
            { query },
          )
          const normal = await beginVoteWeightDispatch(
            'age_milestones',
            new Date(cursorAt.getTime() + 1_000),
            { query },
          )
          expect(normal.windowStart).not.toBeNull()
          expect(new Date(normal.windowStart!).getTime()).toBeGreaterThan(bornAt.getTime())

          const replay = await beginVoteWeightDispatch(
            'age_milestones',
            new Date(cursorAt.getTime() - 1_000),
            { fullReplay: true, query },
          )
          expect(replay.windowStart).toBeNull()
          const page = await dispatchVoteWeightAgeMilestones({
            window: replay,
            afterId: v7({ msecs: bornAt.getTime() - 1 }),
          })
          expect(page.events).toEqual([{ userId, jobId: `voteWeight__${userId}__age__0` }])
          expect(page.continuation?.window).toEqual(replay)

          await completeVoteWeightDispatch('age_milestones', replay, { query })
          const committed = await readVoteWeightDispatchCursorForTest('age_milestones', query)
          expect(new Date(committed!).toISOString()).toBe(cursorAt.toISOString())
        },
      )
    } finally {
      restore()
    }
  })
})
