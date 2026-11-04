import { describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '../../test-helpers/dynamic-config.mts'
import { createHackerNewsRetentionFixtureForTest } from '../../test-helpers/hacker-news-retention.mts'
import { hackerNewsWorkConfig } from '../urls/hacker-news-work-limits.mts'

describe('Hacker News reference retention', () => {
  it('caps each run, resumes expired rows, and retains zero-hit lookups at the cutoff', async () => {
    await hackerNewsWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsWorkConfig, {
        retention_days: 30,
        retention_batch_size: 1,
        retention_max_batches: 1,
      }),
    )
    await using fixture = await createHackerNewsRetentionFixtureForTest()
    expect(await fixture.read()).toEqual({
      totals: {
        [fixture.expired]: { story_count: 1, comment_count: 1 },
        [fixture.expiredZero]: { story_count: 0, comment_count: 0 },
        [fixture.liveZero]: { story_count: 0, comment_count: 0 },
      },
      stories: [fixture.expired],
      comments: [fixture.expired],
    })

    expect(await fixture.cleanup()).toEqual({ deleted: 1, hasMore: true })
    expect(await fixture.read()).toEqual({
      totals: {
        [fixture.expiredZero]: { story_count: 0, comment_count: 0 },
        [fixture.liveZero]: { story_count: 0, comment_count: 0 },
      },
      stories: [],
      comments: [],
    })

    expect(await fixture.cleanup()).toEqual({ deleted: 1, hasMore: true })
    const remaining = {
      totals: { [fixture.liveZero]: { story_count: 0, comment_count: 0 } },
      stories: [],
      comments: [],
    }
    expect(await fixture.read()).toEqual(remaining)
    expect(await fixture.cleanup()).toEqual({ deleted: 0, hasMore: false })
    expect(await fixture.read()).toEqual(remaining)
  })
})
