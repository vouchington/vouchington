import { describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createFailedOAuthVoteWeightEnqueueFixture } from '@voucha/test-helpers/vote-weight-dirty-marker'
import { dispatchVoteWeightDirtyMarkers } from './dispatch-dirty-markers.mts'
import { recalculateUserVoteWeight } from './update.mts'
import { voteWeightWorkConfig } from './work-limits.mts'

describe('dispatchVoteWeightDirtyMarkers', () => {
  it('pages a committed OAuth dirty marker after post-commit enqueue failure', async () => {
    const fixture = await createFailedOAuthVoteWeightEnqueueFixture()
    onTestFinished(fixture.cleanup)
    expect(fixture.reportedErrors).toHaveLength(1)
    expect((await fixture.getUser())?.vote_weight_recalculated_at).toBeNull()

    const restore = overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, {
      dispatch_batch_size: 1,
    })
    try {
      const first = await dispatchVoteWeightDirtyMarkers({ afterId: fixture.afterId })
      expect(first).toEqual({
        events: [{ userId: fixture.userId, jobId: `voteWeight__${fixture.userId}__dirtyMarker` }],
        continuation: { afterId: fixture.userId },
        hasMore: true,
      })
      expect(
        (await dispatchVoteWeightDirtyMarkers(first.continuation!)).events.map(
          event => event.userId,
        ),
      ).not.toContain(fixture.userId)
      expect((await dispatchVoteWeightDirtyMarkers({ afterId: fixture.afterId })).events).toEqual(
        first.events,
      )

      await recalculateUserVoteWeight(fixture.userId, { readFromWriter: true })
      expect((await fixture.getUser())?.vote_weight_recalculated_at).toBeInstanceOf(Date)
      expect(
        (await dispatchVoteWeightDirtyMarkers({ afterId: fixture.afterId })).events.map(
          event => event.userId,
        ),
      ).not.toContain(fixture.userId)
    } finally {
      restore()
    }
  })
})
