import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { DataRetentionLimits } from '@services/data-retention/config'
import { psql } from '@queues/psql/queues'
import {
  getTestPostVoteIds,
  getTopicElectionVoteEventCount,
  getTestVoteIntegrityFlagDetails,
  hasTestUserAgentString,
} from '@voucha/test-helpers'
import {
  createTestVoteRetentionBallots,
  createTestVoteRetentionDetails,
  createTestVoteRetentionPostBallots,
  createTestVoteRetentionPost,
} from '@voucha/test-helpers/vote-retention-processor-fixtures'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import processPsql from '../processors.mts'

const dataRetentionCleanup = vi.fn<(limits: DataRetentionLimits) => Promise<unknown>>()

// Observes the real continuation enqueue; the job is removed so reruns on the shared queue admit it again.
function spyOnContinuationAdmission(...jobIds: string[]) {
  const addBulk = vi.spyOn(psql, 'addBulk')
  onTestFinished(async () => {
    addBulk.mockRestore()
    await Promise.all(jobIds.map(async id => (await psql.getJob(id))?.remove()))
  })
  return addBulk
}
const emptyCleanupResult = {
  classifierRecords: { runs: { hasMore: false } },
  softDeletedUsers: { hasMore: false },
  postModerationLedger: {
    deletedVersions: 0,
    clearedPassEvidence: 0,
    hasMore: false,
    remainingKinds: [],
  },
  agentModerations: { scanned: 0, deleted: 0, hasMore: false, continuation: null },
  aiUsageRecords: { hasMore: false },
  textEmbeddingCache: { hasMore: false },
  terminalEmbeddingBatches: { hasMore: false },
  oldMediaDeliveryChanges: { hasMore: false },
  supersededVoteBallots: [],
  orphanedUserAgentStrings: { hasMore: false },
  voteIntegrityDetails: { hasMore: false },
}

describe('processPsql vote retention continuations', () => {
  it.each([
    ['ballots', 'vote-retention__5605b7d64d0d7e4cfe5f3ba415848964'],
    ['user agents', 'vote-retention__4b3015f3a017db8774bd7bc65d3683fe'],
    ['integrity details', 'vote-retention__e270cae7342a94610857b47372d5c9cd'],
  ] as const)('enqueues a continuation when %s have another page', async (family, childJobId) => {
    const addBulk = spyOnContinuationAdmission(childJobId)
    const result = {
      ...emptyCleanupResult,
      supersededVoteBallots: [{ voteTable: 'post_votes', hasMore: family === 'ballots' }],
      orphanedUserAgentStrings: { hasMore: family === 'user agents' },
      voteIntegrityDetails: { hasMore: family === 'integrity details' },
    }
    dataRetentionCleanup.mockReset().mockResolvedValue(result as never)

    await processPsql(
      'dataRetentionCleanup',
      undefined,
      { dataRetentionCleanup: dataRetentionCleanup as never },
      'parent-retention-job',
    )

    expect(addBulk).toHaveBeenCalledOnce()
    const rows = addBulk.mock.calls[0]![0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'continueVoteRetentionCleanup',
      opts: { jobId: childJobId },
    })
    expect(rows[0]!.data).toEqual({
      voteTables: family === 'ballots' ? ['post_votes'] : [],
      userAgentStrings: family === 'user agents',
      voteIntegrityDetails: family === 'integrity details',
    })
  })

  it('does not enqueue a continuation when all retention pages are complete', async () => {
    const addBulk = spyOnContinuationAdmission()
    dataRetentionCleanup.mockReset().mockResolvedValue(emptyCleanupResult)

    await processPsql(
      'dataRetentionCleanup',
      undefined,
      { dataRetentionCleanup: dataRetentionCleanup as never },
      'parent-retention-job',
    )

    expect(addBulk).not.toHaveBeenCalled()
  })

  it('keeps completed ballot families out of later continuation pages', async () => {
    const owned = await createTestVoteRetentionBallots()
    const neighbor = await createTestVoteRetentionBallots()
    const options = {
      batchSize: 1,
      now: new Date('2026-11-04T12:00:00Z'),
      voteIdsByTable: {
        post_votes: [owned.postSupersederId],
        topic_votes: [owned.topicSupersederId],
      },
    }
    const addBulk = spyOnContinuationAdmission('vote-retention__a0db7a4f62b4a73e46ae2961f8a54bab')
    const first = await processPsql(
      'continueVoteRetentionCleanup',
      {
        voteTables: ['post_votes', 'topic_votes'],
        userAgentStrings: false,
        voteIntegrityDetails: false,
      },
      undefined,
      'first-page',
      { vote: options },
    )
    expect(first).toEqual({
      supersededVoteBallots: [
        { voteTable: 'post_votes', scanned: 2, deleted: 1, hasMore: false },
        { voteTable: 'topic_votes', scanned: 2, deleted: 1, hasMore: true },
      ],
      orphanedUserAgentStrings: { scanned: 0, deleted: 0, hasMore: false },
      voteIntegrityDetails: { scanned: 0, redacted: 0, hasMore: false },
    })
    const next = {
      voteTables: ['topic_votes'],
      userAgentStrings: false,
      voteIntegrityDetails: false,
    }
    expect(addBulk).toHaveBeenCalledOnce()
    const rows = addBulk.mock.calls[0]![0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'continueVoteRetentionCleanup',
      opts: { jobId: 'vote-retention__a0db7a4f62b4a73e46ae2961f8a54bab' },
    })
    expect(rows[0]!.data).toEqual({
      voteTables: ['topic_votes'],
      userAgentStrings: false,
      voteIntegrityDetails: false,
    })
    const second = await processPsql(
      'continueVoteRetentionCleanup',
      next,
      undefined,
      'second-page',
      { vote: options },
    )
    expect(second).toEqual({
      supersededVoteBallots: [{ voteTable: 'topic_votes', scanned: 2, deleted: 1, hasMore: false }],
      orphanedUserAgentStrings: { scanned: 0, deleted: 0, hasMore: false },
      voteIntegrityDetails: { scanned: 0, redacted: 0, hasMore: false },
    })
    expect(addBulk).toHaveBeenCalledOnce()
    expect(await getTestPostVoteIds(owned.postId, owned.userId)).toEqual([owned.postSupersederId])
    expect(await getTopicElectionVoteEventCount(owned.userId, owned.topicId)).toBe(1)
    expect(await getTestPostVoteIds(neighbor.postId, neighbor.userId)).toEqual([
      neighbor.postOlderId,
      neighbor.postSupersederId,
    ])
    expect(await getTopicElectionVoteEventCount(neighbor.userId, neighbor.topicId)).toBe(3)
  })

  it('runs selected detail pages and leaves disabled and excluded rows unchanged', async () => {
    const ballots = await createTestVoteRetentionPostBallots()
    const owned = await createTestVoteRetentionDetails(ballots.postId)
    const neighborPost = await createTestVoteRetentionPost()
    const neighbor = await createTestVoteRetentionDetails(neighborPost.postId)
    const options = {
      batchSize: 1,
      now: new Date('2100-01-01T00:00:00Z'),
      voteIdsByTable: { post_votes: [ballots.postSupersederId] },
      userAgentStringIds: [owned.userAgentStringId],
      voteIntegrityFlagIds: [owned.flagId],
    }
    const addBulk = spyOnContinuationAdmission()
    expect(
      await processPsql(
        'continueVoteRetentionCleanup',
        { voteTables: ['post_votes'], userAgentStrings: false, voteIntegrityDetails: false },
        undefined,
        'disabled-details',
        { vote: options },
      ),
    ).toEqual({
      supersededVoteBallots: [{ voteTable: 'post_votes', scanned: 2, deleted: 1, hasMore: false }],
      orphanedUserAgentStrings: { scanned: 0, deleted: 0, hasMore: false },
      voteIntegrityDetails: { scanned: 0, redacted: 0, hasMore: false },
    })
    expect(await hasTestUserAgentString(owned.userAgentStringId)).toBe(true)
    expect(await getTestVoteIntegrityFlagDetails(owned.flagId)).toEqual({
      ip_address: '203.0.113.99',
      threshold: 3,
    })
    expect(
      await processPsql(
        'continueVoteRetentionCleanup',
        { voteTables: [], userAgentStrings: true, voteIntegrityDetails: true },
        undefined,
        'selected-details',
        { vote: options },
      ),
    ).toEqual({
      supersededVoteBallots: [],
      orphanedUserAgentStrings: { scanned: 1, deleted: 1, hasMore: false },
      voteIntegrityDetails: { scanned: 1, redacted: 1, hasMore: false },
    })
    expect(await hasTestUserAgentString(owned.userAgentStringId)).toBe(false)
    expect(await getTestVoteIntegrityFlagDetails(owned.flagId)).toEqual({ threshold: 3 })
    expect(await hasTestUserAgentString(neighbor.userAgentStringId)).toBe(true)
    expect(await getTestVoteIntegrityFlagDetails(neighbor.flagId)).toEqual({
      ip_address: '203.0.113.99',
      threshold: 3,
    })
    expect(
      await processPsql(
        'continueVoteRetentionCleanup',
        { voteTables: [], userAgentStrings: true, voteIntegrityDetails: true },
        undefined,
        'empty-details',
        { vote: options },
      ),
    ).toEqual({
      supersededVoteBallots: [],
      orphanedUserAgentStrings: { scanned: 0, deleted: 0, hasMore: false },
      voteIntegrityDetails: { scanned: 0, redacted: 0, hasMore: false },
    })
    expect(addBulk).not.toHaveBeenCalled()
  })

  it('rolls back a ballot write failure without admitting a continuation', async () => {
    const owned = await createTestVoteRetentionPostBallots()
    const neighbor = await createTestVoteRetentionPostBallots()
    const addBulk = spyOnContinuationAdmission()
    const restore = runBeforePostgresStatementForTest('deleteSupersededVoteBallots', async () => {
      throw new Error('retention page failed')
    })
    onTestFinished(restore)
    await expect(
      processPsql(
        'continueVoteRetentionCleanup',
        { voteTables: ['post_votes'], userAgentStrings: false, voteIntegrityDetails: false },
        undefined,
        'failed-page',
        {
          vote: {
            batchSize: 1,
            now: new Date('2026-11-04T12:00:00Z'),
            voteIdsByTable: { post_votes: [owned.postSupersederId] },
          },
        },
      ),
    ).rejects.toThrow('retention page failed')
    expect(await getTestPostVoteIds(owned.postId, owned.userId)).toEqual([
      owned.postOlderId,
      owned.postSupersederId,
    ])
    expect(await getTestPostVoteIds(neighbor.postId, neighbor.userId)).toEqual([
      neighbor.postOlderId,
      neighbor.postSupersederId,
    ])
    expect(addBulk).not.toHaveBeenCalled()
  })
})
