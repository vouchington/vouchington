import { describe, expect, it } from 'vitest'
import { seedUuid } from './common.mts'
import {
  STORY_POST_RELATED_URL_PROJECTION_SEED,
  STORY_POST_RELATED_URL_PROJECTION_SEED_COUNT,
} from './story-post-related-url-projection.mts'

describe('story post related URL projection EXPLAIN seed', () => {
  it('defines a dedicated high-cardinality story cohort', () => {
    expect(STORY_POST_RELATED_URL_PROJECTION_SEED_COUNT).toBe(1_000)
    expect(STORY_POST_RELATED_URL_PROJECTION_SEED.storyId).toBe(seedUuid(200_000, '17'))
  })
})
