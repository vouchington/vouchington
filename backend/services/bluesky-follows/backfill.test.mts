import { describe, expect, it } from 'vitest'
import {
  BLUESKY_FOLLOW_PROPAGATION_CANDIDATE_QUERY,
  streamBlueskyFollowPropagationCandidateBatchesFromRows,
} from './backfill.mts'

describe('streamBlueskyFollowPropagationCandidateBatches', () => {
  it('yields full and trailing batches', async () => {
    async function* rows() {
      for (let i = 0; i < 501; i += 1) {
        yield { follower_user_id: `follower-${i}`, followee_user_id: `followee-${i}` }
      }
    }

    const batches: { followerUserId: string; followeeUserId: string }[][] = []
    for await (const batch of streamBlueskyFollowPropagationCandidateBatchesFromRows(rows())) {
      batches.push(batch)
    }

    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(500)
    expect(batches[1]).toEqual([{ followerUserId: 'follower-500', followeeUserId: 'followee-500' }])
  })

  it('yields nothing when there are no candidates', async () => {
    async function* rows() {}

    const batches: { followerUserId: string; followeeUserId: string }[][] = []
    for await (const batch of streamBlueskyFollowPropagationCandidateBatchesFromRows(rows())) {
      batches.push(batch)
    }

    expect(batches).toEqual([])
  })

  it('gates both relation and receipt candidates on active attached authorizations', async () => {
    expect(BLUESKY_FOLLOW_PROPAGATION_CANDIDATE_QUERY.match(/status = 'attached'/g)).toHaveLength(4)
    expect(BLUESKY_FOLLOW_PROPAGATION_CANDIDATE_QUERY.match(/user_suspensions/g)).toHaveLength(2)
    expect(BLUESKY_FOLLOW_PROPAGATION_CANDIDATE_QUERY.match(/deleted_at IS NULL/g)).toHaveLength(5)
  })
})
