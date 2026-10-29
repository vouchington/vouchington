import { describe, expect, it, vi } from 'vitest'
import type { DataRetentionLimits } from '@services/data-retention/config'
import type { VoteRetentionContinuationData } from '@queues/psql/types'
import processPsql from '../processors.mts'

const dataRetentionCleanup = vi.fn<(limits: DataRetentionLimits) => Promise<unknown>>()
const enqueueDataRetentionContinuation =
  vi.fn<(jobId: string, data: VoteRetentionContinuationData) => Promise<never[]>>()
const emptyCleanupResult = {
  classifierRecords: { runs: { hasMore: false } },
  softDeletedUsers: { hasMore: false },
  textEmbeddingCache: { hasMore: false },
  terminalEmbeddingBatches: { hasMore: false },
  oldMediaDeliveryChanges: { hasMore: false },
  supersededVoteBallots: [],
  orphanedUserAgentStrings: { hasMore: false },
  voteIntegrityDetails: { hasMore: false },
}

describe('processPsql vote retention continuations', () => {
  it.each(['ballots', 'user agents', 'integrity details'] as const)(
    'enqueues a continuation when %s have another page',
    async family => {
      const result = {
        ...emptyCleanupResult,
        supersededVoteBallots: [{ voteTable: 'post_votes', hasMore: family === 'ballots' }],
        orphanedUserAgentStrings: { hasMore: family === 'user agents' },
        voteIntegrityDetails: { hasMore: family === 'integrity details' },
      }
      dataRetentionCleanup.mockReset().mockResolvedValue(result as never)
      enqueueDataRetentionContinuation.mockReset().mockResolvedValue([])

      await processPsql(
        'dataRetentionCleanup',
        undefined,
        {
          dataRetentionCleanup: dataRetentionCleanup as never,
          enqueueDataRetentionContinuation,
        },
        'parent-retention-job',
      )

      expect(enqueueDataRetentionContinuation).toHaveBeenCalledExactlyOnceWith(
        'parent-retention-job',
        {
          voteTables: family === 'ballots' ? ['post_votes'] : [],
          userAgentStrings: family === 'user agents',
          voteIntegrityDetails: family === 'integrity details',
        },
      )
    },
  )

  it('does not enqueue a continuation when all retention pages are complete', async () => {
    dataRetentionCleanup.mockReset().mockResolvedValue(emptyCleanupResult)
    enqueueDataRetentionContinuation.mockReset().mockResolvedValue([])

    await processPsql(
      'dataRetentionCleanup',
      undefined,
      {
        dataRetentionCleanup: dataRetentionCleanup as never,
        enqueueDataRetentionContinuation,
      },
      'parent-retention-job',
    )

    expect(enqueueDataRetentionContinuation).not.toHaveBeenCalled()
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
    enqueueDataRetentionContinuation.mockReset().mockResolvedValue([])

    await processPsql(
      'continueVoteRetentionCleanup',
      { voteTables: allTables, userAgentStrings: false, voteIntegrityDetails: false },
      {
        voteRetentionCleanupPage: voteRetentionCleanupPage as never,
        enqueueDataRetentionContinuation,
      },
      'first-page',
    )
    const next = enqueueDataRetentionContinuation.mock.calls[0]?.[1]
    expect(next).toEqual({
      voteTables: ['topic_votes'],
      userAgentStrings: false,
      voteIntegrityDetails: false,
    })

    await processPsql(
      'continueVoteRetentionCleanup',
      next,
      {
        voteRetentionCleanupPage: voteRetentionCleanupPage as never,
        enqueueDataRetentionContinuation,
      },
      'second-page',
    )

    expect(voteRetentionCleanupPage).toHaveBeenNthCalledWith(2, expect.anything(), next)
    expect(enqueueDataRetentionContinuation).toHaveBeenCalledTimes(1)
  })
})
