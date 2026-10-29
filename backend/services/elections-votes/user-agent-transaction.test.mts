import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestAgent,
  createTestPost,
  createTestTopic,
  createTestUser,
  getPostLLMModerations,
  hasTestUserAgentStringValue,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestPost,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import type { ElectionVoteScore } from './shared/types.mts'
import { upsertAgentModerationElectionVotes } from './agent-moderation/votes-upsert.mts'
import { upsertEntityRelationElectionVotes } from './entity-relation/votes-upsert.mts'

describe('ballot user-agent lookup transaction', () => {
  it('rolls back an owned agent moderation lookup when its ballot transaction fails', async () => {
    const user = await createTestUser()
    const agent = await createTestAgent({ agentType: 'moderator', activated: true })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
    const postId = await insertTestPost({
      title: 'User agent transaction test',
      slug: `ua-transaction-${randomUUID()}`,
      createdById: user.id,
      markdown: 'test',
    })
    await insertTestAgentModeration({
      postId,
      promptId,
      agentId: agent.id,
      flagged: false,
      results: { flagged: false },
    })
    const moderationId = ((await getPostLLMModerations(postId)) as Array<{ id: string }>)[0]?.id
    if (!moderationId) throw new Error('Missing agent moderation target')
    const userAgent = `agent-moderation-rollback-${randomUUID()}`
    await expect(
      upsertAgentModerationElectionVotes(
        user.id,
        [{ entityId: moderationId, score: 1 }],
        { ipAddress: null, deviceId: null, sessionId: null, userAgent },
        async () => {
          throw new Error('Stop before ballot commit')
        },
      ),
    ).rejects.toThrow('Stop before ballot commit')
    expect(await hasTestUserAgentStringValue(userAgent)).toBe(false)
  })

  it('rolls back an owned entity relation lookup when ballot storage rejects the score', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const topic = await createTestTopic({ user })
    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'category',
      objectType: 'topic',
    })
    const [relation] = await upsertEntityRelation(user, metadata, post, [topic], { vote: false })
    if (!relation?.id) throw new Error('Missing entity relation target')
    const userAgent = `relation-rollback-${randomUUID()}`
    await expect(
      upsertEntityRelationElectionVotes(
        user.id,
        [{ entityId: relation.id, score: 3 as ElectionVoteScore }],
        { ipAddress: null, deviceId: null, sessionId: null, userAgent },
        metadata,
        { enqueueVoteStats: false },
      ),
    ).rejects.toThrow('violates check constraint')
    expect(await hasTestUserAgentStringValue(userAgent)).toBe(false)
  })
})
