import { randomUUID } from 'node:crypto'
import { onTestFinished, vi } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { psql } from '@queues/psql/queues'
import type { DataRetentionCleanupOptions } from '../services/data-retention/cleanup.mts'
import { reserveTestVoteRetention } from './vote-retention-reservation.mts'
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

export async function createTestVoteRetentionPostBallotContinuation() {
  const ballot = await createTestVoteRetentionPostBallots()
  const secondOlderId = uuidv7({ msecs: Date.parse('2026-01-02T00:00:00Z') })
  await insertTestPostVote(ballot.postId, ballot.userId, '127.0.0.1', 1, secondOlderId)
  return { ...ballot, secondOlderId }
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

/** Reserve the fixed parent job across parallel test processes until its child is removed. */
export async function spyOnTestVoteRetentionAdmission(...jobIds: string[]) {
  const reservation = await reserveTestVoteRetention()
  const addBulk = vi.spyOn(psql, 'addBulk')
  onTestFinished(async () => {
    addBulk.mockRestore()
    try {
      await Promise.all(jobIds.map(async id => (await psql.getJob(id))?.remove()))
    } finally {
      await reservation.release()
    }
  })
  return addBulk
}

export async function createTestDailyVoteRetentionPage(
  family: 'ballots' | 'user agents' | 'integrity details',
) {
  const retention: DataRetentionCleanupOptions = {
    families: [
      family === 'ballots'
        ? 'supersededVoteBallots'
        : family === 'user agents'
          ? 'orphanedUserAgentStrings'
          : 'voteIntegrityDetails',
    ],
    voteRetention: { batchSize: 1, now: new Date('2100-01-01T00:00:00Z') },
  }
  if (family === 'ballots') {
    const owned = await createTestVoteRetentionPostBallotContinuation()
    const neighbor = await createTestVoteRetentionPostBallots()
    retention.voteBallotIdsByTable = { post_votes: [owned.postSupersederId] }
    return { retention, ballot: { owned, neighbor }, detail: null }
  }
  const post = await createTestVoteRetentionPost()
  const first = await createTestVoteRetentionDetails(post.postId)
  const secondPost = await createTestVoteRetentionPost()
  const second = await createTestVoteRetentionDetails(secondPost.postId)
  const neighborPost = await createTestVoteRetentionPost()
  const neighbor = await createTestVoteRetentionDetails(neighborPost.postId)
  if (family === 'user agents')
    retention.userAgentStringIds = [first.userAgentStringId, second.userAgentStringId]
  else retention.voteIntegrityFlagIds = [first.flagId, second.flagId]
  return { retention, ballot: null, detail: { first, second, neighbor } }
}
