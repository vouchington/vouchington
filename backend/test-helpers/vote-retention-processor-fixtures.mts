import { randomUUID } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import {
  createTestUserDirect,
  insertTestPost,
  insertTestPostVote,
  insertTestTopic,
  insertTopicElectionVote,
  insertTestVoteIntegrityFlag,
} from './entities/index.mts'

export async function createTestVoteRetentionPost() {
  const user = await createTestUserDirect()
  const postId = await insertTestPost({
    createdById: user.id,
    title: 'Retention continuation',
    slug: `retention-${randomUUID()}`,
    markdown: 'test',
  })
  return { userId: user.id, postId }
}

export async function createTestVoteRetentionPostBallots() {
  const { userId, postId } = await createTestVoteRetentionPost()
  const postOlderId = uuidv7({ msecs: Date.parse('2026-01-01T00:00:00Z') })
  const postSupersederId = uuidv7({ msecs: Date.parse('2026-02-01T00:00:00Z') })
  await insertTestPostVote(postId, userId, '127.0.0.1', 1, postOlderId)
  await insertTestPostVote(postId, userId, '127.0.0.1', -1, postSupersederId)
  return { userId, postId, postOlderId, postSupersederId }
}

export async function createTestVoteRetentionBallots() {
  const post = await createTestVoteRetentionPostBallots()
  const topicId = await insertTestTopic({
    createdById: post.userId,
    name: `Retention continuation ${randomUUID()}`,
    slug: `retention-${randomUUID()}`,
  })
  const topicSupersederId = uuidv7({ msecs: Date.parse('2026-02-01T00:00:00Z') })
  await insertTopicElectionVote(
    post.userId,
    topicId,
    1,
    uuidv7({ msecs: Date.parse('2026-01-01T00:00:00Z') }),
  )
  await insertTopicElectionVote(
    post.userId,
    topicId,
    1,
    uuidv7({ msecs: Date.parse('2026-01-02T00:00:00Z') }),
  )
  await insertTopicElectionVote(post.userId, topicId, -1, topicSupersederId)
  return { ...post, topicId, topicSupersederId }
}

export async function createTestVoteRetentionDetails(postId: string) {
  const userAgentStringId = await upsertUserAgentString(`retention-${randomUUID()}`)
  if (!userAgentStringId) throw new Error('Expected a user-agent fixture')
  const flagId = await insertTestVoteIntegrityFlag({
    postId,
    flagType: 'ip_correlation',
    id: uuidv7({ msecs: Date.parse('2026-01-01T00:00:00Z') }),
    details: { ip_address: '203.0.113.99', threshold: 3 },
  })
  return { userAgentStringId, flagId }
}
