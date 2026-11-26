import assert from 'node:assert/strict'
import { checkEmbeddingSimilarityToBannedPosts } from '@services/communities/ban-evasion/signals'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const QUERY = 'checkEmbeddingSimilarityToBannedPosts'
const TRIGGER_SCENARIO = 'community-ban-embedding-triggering-post'
const HISTORY_SCENARIO = 'community-ban-embedding-candidate-history'

export async function runCommunityBanEmbeddingCapacity(
  communityId: string,
  candidateId: string,
  bannedId: string,
  matchingPostId: string,
  stalePostId: string,
): Promise<void> {
  const match = { matched: true, score: 1, sourceUserId: bannedId }
  const crossPartition = { posts: 'Banned-user posts may predate the candidate post and ban.' }
  registerScenarioContract(TRIGGER_SCENARIO, {
    allowEmptyResult: true,
    expectations: [
      // Main's generic plan reads all embedded posts by each probed ban author.
      // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7192177605
      { kind: 'maxProcessedRows', relation: 'posts', max: 196 },
      { kind: 'maxProcessedRows', relation: 'community_bans', max: 66 },
      { kind: 'maxInputRows', nodeType: 'Sort', max: 128 },
    ],
    crossPartition,
  })
  await runAndCapture(
    TRIGGER_SCENARIO,
    async () => {
      assert.deepEqual(
        await checkEmbeddingSimilarityToBannedPosts(communityId, candidateId, matchingPostId),
        match,
      )
      assert.deepEqual(
        await checkEmbeddingSimilarityToBannedPosts(communityId, candidateId, stalePostId),
        { matched: false, score: 0 },
      )
    },
    undefined,
    QUERY,
    { exactCapturedNames: [QUERY, QUERY] },
  )

  registerScenarioContract(HISTORY_SCENARIO, {
    expectations: [
      // Both modes sort all 128 × 64 pairs before ranking source users.
      // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7192177605
      { kind: 'maxProcessedRows', relation: 'posts', max: 25_088 },
      { kind: 'maxProcessedRows', relation: 'community_bans', max: 8_448 },
      { kind: 'maxInputRows', nodeType: 'Sort', max: 8_256 },
    ],
    crossPartition,
  })
  await runAndCapture(
    HISTORY_SCENARIO,
    async () => {
      assert.deepEqual(await checkEmbeddingSimilarityToBannedPosts(communityId, candidateId), match)
    },
    undefined,
    QUERY,
    { exactCapturedNames: [QUERY] },
  )
}
