import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { DataRetentionLimits } from '@services/data-retention/config'
import { psql } from '@queues/psql/queues'
import type { VoteRetentionContinuationData } from '@queues/psql/types'
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
      data: {
        voteTables: family === 'ballots' ? ['post_votes'] : [],
        userAgentStrings: family === 'user agents',
        voteIntegrityDetails: family === 'integrity details',
      },
      opts: { jobId: childJobId },
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
    const allTables = ['post_votes', 'topic_votes']
    const continuationPages = [
      {
        supersededVoteBallots: [
          { voteTable: 'post_votes', hasMore: false },
          { voteTable: 'topic_votes', hasMore: true },
        ],
        orphanedUserAgentStrings: { hasMore: false },
        voteIntegrityDetails: { hasMore: false },
      },
      {
        supersededVoteBallots: [{ voteTable: 'topic_votes', hasMore: false }],
        orphanedUserAgentStrings: { hasMore: false },
        voteIntegrityDetails: { hasMore: false },
      },
    ]
    const voteRetentionCleanupPage = vi
      .fn<(limits: DataRetentionLimits, data: VoteRetentionContinuationData) => Promise<unknown>>()
      .mockResolvedValueOnce(continuationPages[0])
      .mockResolvedValueOnce(continuationPages[1])
    const addBulk = spyOnContinuationAdmission('vote-retention__a0db7a4f62b4a73e46ae2961f8a54bab')

    await processPsql(
      'continueVoteRetentionCleanup',
      { voteTables: allTables, userAgentStrings: false, voteIntegrityDetails: false },
      { voteRetentionCleanupPage: voteRetentionCleanupPage as never },
      'first-page',
    )
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
      data: next,
      opts: { jobId: 'vote-retention__a0db7a4f62b4a73e46ae2961f8a54bab' },
    })

    await processPsql(
      'continueVoteRetentionCleanup',
      next,
      { voteRetentionCleanupPage: voteRetentionCleanupPage as never },
      'second-page',
    )

    expect(voteRetentionCleanupPage).toHaveBeenNthCalledWith(2, expect.anything(), next)
    expect(addBulk).toHaveBeenCalledOnce()
  })
})
