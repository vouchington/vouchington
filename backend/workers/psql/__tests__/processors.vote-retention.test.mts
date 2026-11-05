import { describe, expect, it, onTestFinished } from 'vitest'
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
  spyOnTestVoteRetentionAdmission,
} from '@voucha/test-helpers/vote-retention-processor-fixtures'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import processPsql from '../processors.mts'

describe('processPsql vote retention continuations', () => {
  it('keeps completed ballot families out of later continuation pages', async () => {
    const addBulk = await spyOnTestVoteRetentionAdmission(
      'vote-retention__a0db7a4f62b4a73e46ae2961f8a54bab',
    )
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
    const addBulk = await spyOnTestVoteRetentionAdmission()
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
    const addBulk = await spyOnTestVoteRetentionAdmission()
    const owned = await createTestVoteRetentionPostBallots()
    const neighbor = await createTestVoteRetentionPostBallots()

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
