import { describe, expect, it } from 'vitest'
import {
  withVoteWeightDispatchCursorForTest,
  readVoteWeightDispatchCursorForTest,
} from '@voucha/test-helpers/vote-weight-dispatch'
import { completeVoteWeightDispatch } from './dispatch-cursor.mts'

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
})
