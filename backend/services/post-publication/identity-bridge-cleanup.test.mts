import { randomBytes } from 'node:crypto'
import {
  createTestPost,
  createTestUser,
  insertTestCommunity,
  readTestPublicationBridgeTraversalBound,
  readTestPublicationIdentityBridge,
} from '@voucha/test-helpers'
import {
  createSyntheticClassifier,
  setSyntheticPostContent,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import {
  requestSyntheticRun,
  reserveSyntheticRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { describe, expect, it } from 'vitest'
import { cleanupPostPublicationIdentityBridges } from './identity-bridge-cleanup.mts'

describe('publication identity bridge cleanup', () => {
  it('keeps a community identity that a classifier run still references', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const post = await createTestPost({ user, community_id: community.id })
    const inputSha256 = randomBytes(32)
    await setSyntheticPostContent(post.id, inputSha256)
    const classifier = await createSyntheticClassifier()
    const fixture = {
      ...classifier,
      post: { id: post.id, inputSha256 },
      subject: { postId: post.id, rssFeedItemId: null },
    } as const
    await requestSyntheticRun(fixture)
    await reserveSyntheticRun(fixture)
    expect(await readTestPublicationIdentityBridge('community', community.id)).toBeDefined()

    let examined = false
    const bound = await readTestPublicationBridgeTraversalBound(100)
    for (let page = 0; page < bound * 2 && !examined; page++) {
      const result = await cleanupPostPublicationIdentityBridges()
      examined = result.family === 'community' && result.candidates.includes(community.id)
    }

    expect(examined).toBe(true)
    expect(await readTestPublicationIdentityBridge('community', community.id)).toBeDefined()
  })
})
