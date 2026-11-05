import { describe, expect, it } from 'vitest'
import type { runDataRetentionCleanup } from '@services/data-retention'
import {
  getTestPostVoteIds,
  getTestVoteIntegrityFlagDetails,
  hasTestUserAgentString,
} from '@voucha/test-helpers'
import {
  createTestDailyVoteRetentionPage,
  createTestVoteRetentionDetails,
  createTestVoteRetentionPostBallots,
  spyOnTestVoteRetentionAdmission,
} from '@voucha/test-helpers/vote-retention-processor-fixtures'
import processPsql from '../processors.mts'

type DailyRetentionResult = Awaited<ReturnType<typeof runDataRetentionCleanup>>

describe('processPsql daily vote retention admission', () => {
  it('enqueues a continuation when ballots have another page', async () => {
    const addBulk = await spyOnTestVoteRetentionAdmission(
      'vote-retention__5605b7d64d0d7e4cfe5f3ba415848964',
    )

    const fixture = await createTestDailyVoteRetentionPage('ballots')
    const { owned, neighbor } = fixture.ballot!
    const result = (await processPsql(
      'dataRetentionCleanup',
      undefined,
      undefined,
      'parent-retention-job',
      { retention: fixture.retention },
    )) as DailyRetentionResult
    expect(result.supersededVoteBallots.find(page => page.voteTable === 'post_votes')).toEqual({
      voteTable: 'post_votes',
      scanned: 2,
      deleted: 1,
      hasMore: true,
    })
    expect(await getTestPostVoteIds(owned.postId, owned.userId)).toEqual([
      owned.secondOlderId,
      owned.postSupersederId,
    ])
    expect(await getTestPostVoteIds(neighbor.postId, neighbor.userId)).toEqual([
      neighbor.postOlderId,
      neighbor.postSupersederId,
    ])
    expect(addBulk).toHaveBeenCalledOnce()
    const rows = addBulk.mock.calls[0]![0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'continueVoteRetentionCleanup',
      opts: { jobId: 'vote-retention__5605b7d64d0d7e4cfe5f3ba415848964' },
    })
    expect(rows[0]!.data).toEqual({
      voteTables: ['post_votes'],
      userAgentStrings: false,
      voteIntegrityDetails: false,
    })
  })

  it('enqueues a continuation when user agents have another page', async () => {
    const addBulk = await spyOnTestVoteRetentionAdmission(
      'vote-retention__4b3015f3a017db8774bd7bc65d3683fe',
    )

    const fixture = await createTestDailyVoteRetentionPage('user agents')
    const result = (await processPsql(
      'dataRetentionCleanup',
      undefined,
      undefined,
      'parent-retention-job',
      { retention: fixture.retention },
    )) as DailyRetentionResult
    expect(result.orphanedUserAgentStrings).toEqual({ scanned: 1, deleted: 1, hasMore: true })
    expect(await hasTestUserAgentString(fixture.detail!.neighbor.userAgentStringId)).toBe(true)
    expect(addBulk).toHaveBeenCalledOnce()
    const rows = addBulk.mock.calls[0]![0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'continueVoteRetentionCleanup',
      opts: { jobId: 'vote-retention__4b3015f3a017db8774bd7bc65d3683fe' },
    })
    expect(rows[0]!.data).toEqual({
      voteTables: [],
      userAgentStrings: true,
      voteIntegrityDetails: false,
    })
  })

  it('enqueues a continuation when integrity details have another page', async () => {
    const addBulk = await spyOnTestVoteRetentionAdmission(
      'vote-retention__e270cae7342a94610857b47372d5c9cd',
    )

    const fixture = await createTestDailyVoteRetentionPage('integrity details')
    const result = (await processPsql(
      'dataRetentionCleanup',
      undefined,
      undefined,
      'parent-retention-job',
      { retention: fixture.retention },
    )) as DailyRetentionResult
    expect(result.voteIntegrityDetails).toEqual({ scanned: 1, redacted: 1, hasMore: true })
    expect(await getTestVoteIntegrityFlagDetails(fixture.detail!.neighbor.flagId)).toEqual({
      ip_address: '203.0.113.99',
      threshold: 3,
    })
    expect(addBulk).toHaveBeenCalledOnce()
    const rows = addBulk.mock.calls[0]![0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'continueVoteRetentionCleanup',
      opts: { jobId: 'vote-retention__e270cae7342a94610857b47372d5c9cd' },
    })
    expect(rows[0]!.data).toEqual({
      voteTables: [],
      userAgentStrings: false,
      voteIntegrityDetails: true,
    })
  })

  it('does not enqueue a continuation when all retention pages are complete', async () => {
    const addBulk = await spyOnTestVoteRetentionAdmission()
    const ballot = await createTestVoteRetentionPostBallots()
    const owned = await createTestVoteRetentionDetails(ballot.postId)
    const neighborBallot = await createTestVoteRetentionPostBallots()
    const neighbor = await createTestVoteRetentionDetails(neighborBallot.postId)

    const result = (await processPsql(
      'dataRetentionCleanup',
      undefined,
      undefined,
      'parent-retention-job',
      {
        retention: {
          families: ['supersededVoteBallots', 'orphanedUserAgentStrings', 'voteIntegrityDetails'],
          voteRetention: { batchSize: 1, now: new Date('2100-01-01T00:00:00Z') },
          voteBallotIdsByTable: { post_votes: [ballot.postSupersederId] },
          userAgentStringIds: [owned.userAgentStringId],
          voteIntegrityFlagIds: [owned.flagId],
        },
      },
    )) as DailyRetentionResult
    expect(result.supersededVoteBallots.find(page => page.voteTable === 'post_votes')).toEqual({
      voteTable: 'post_votes',
      scanned: 2,
      deleted: 1,
      hasMore: false,
    })
    expect(result.orphanedUserAgentStrings).toEqual({ scanned: 1, deleted: 1, hasMore: false })
    expect(result.voteIntegrityDetails).toEqual({ scanned: 1, redacted: 1, hasMore: false })
    expect(await getTestPostVoteIds(neighborBallot.postId, neighborBallot.userId)).toEqual([
      neighborBallot.postOlderId,
      neighborBallot.postSupersederId,
    ])
    expect(await hasTestUserAgentString(neighbor.userAgentStringId)).toBe(true)
    expect(await getTestVoteIntegrityFlagDetails(neighbor.flagId)).toEqual({
      ip_address: '203.0.113.99',
      threshold: 3,
    })
    expect(addBulk).not.toHaveBeenCalled()
  })
})
