import { describe, expect, it } from 'vitest'
import {
  createEntityRelationWithElection,
  createHostnameExclusionFixture,
  createTestPost,
} from '@voucha/test-helpers'
import { getPostIds } from '../get-ids.mts'

describe('getPostIds hostname exclusion', () => {
  it.each(['_', '%'] as const)(
    'preserves SQL LIKE wildcard semantics for %s with overlapping block and mute relations',
    async patternWildcard => {
      const { viewer, publisher, blockedUrlId, visibleUrlId } =
        await createHostnameExclusionFixture({ patternWildcard })
      const blockedPost = await createTestPost({ user: publisher })
      const visiblePost = await createTestPost({ user: publisher })
      await createEntityRelationWithElection(blockedPost.id, blockedUrlId, publisher.id, 1)
      await createEntityRelationWithElection(visiblePost.id, visibleUrlId, publisher.id, 1)

      const result = await getPostIds(viewer, {
        exclude_for_user_id: viewer.id,
        user_id: publisher.id,
        time_range: 'all',
        limit: 100,
      })
      const resultIds = result.results.map(row => row.id)

      expect(resultIds).toEqual([visiblePost.id])
    },
  )
})
