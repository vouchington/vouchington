import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { runDataRetentionCleanup } from '@services/data-retention'
import { enqueueDataRetentionCleanupContinuation } from '@queues/psql/enqueues'
import { psql } from '@queues/psql/queues'
import { AI_RETENTION_FAMILIES, type PsqlRetentionJobData } from '@queues/psql/types'
import processPsql from '../processors.mts'

const noAIRetention = {
  softDeletedUsers: { deleted: 0, hasMore: false },
  postModerationLedger: {
    deletedVersions: 0,
    clearedPassEvidence: 0,
    hasMore: false,
    remainingKinds: [],
  },
  agentModerations: { scanned: 0, deleted: 0, hasMore: false, continuation: null },
  ...Object.fromEntries(AI_RETENTION_FAMILIES.map(family => [family, { hasMore: false }])),
}
const emptyCleanupResult = {
  ...noAIRetention,
  classifierRecords: { runs: { hasMore: false } },
  supersededVoteBallots: [],
  orphanedUserAgentStrings: { hasMore: false },
  voteIntegrityDetails: { hasMore: false },
} as unknown as Awaited<ReturnType<typeof runDataRetentionCleanup>>

describe('processPsql retention continuations', () => {
  it('admits distinct deterministic continuation jobs until the capped sweep converges', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const continuationIds = [1, 2, 3].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(continuationIds.map(async id => (await psql.getJob(id))?.remove()))
    })
    const hasMore = {
      ...emptyCleanupResult,
      classifierRecords: { runs: { scanned: 1, deleted: 0, hasMore: true } },
    } as Awaited<ReturnType<typeof runDataRetentionCleanup>>
    const cleanup = vi
      .fn<typeof runDataRetentionCleanup>()
      .mockResolvedValueOnce(hasMore)
      .mockResolvedValueOnce(hasMore)
      .mockResolvedValue(emptyCleanupResult)

    await processPsql('dataRetentionCleanup', {}, { dataRetentionCleanup: cleanup }, initialJobId)
    const first = await psql.getJob(continuationIds[0]!)
    expect(first?.data).toMatchObject({ continuation: { runId, step: 1 } })

    await processPsql(
      'dataRetentionCleanup',
      first?.data as PsqlRetentionJobData,
      { dataRetentionCleanup: cleanup },
      first!.id,
    )
    const second = await psql.getJob(continuationIds[1]!)
    expect(second?.data).toMatchObject({ continuation: { runId, step: 2 } })

    await processPsql(
      'dataRetentionCleanup',
      second?.data as PsqlRetentionJobData,
      { dataRetentionCleanup: cleanup },
      second!.id,
    )
    expect(await psql.getJob(continuationIds[2]!)).toBeNull()
    expect(cleanup).toHaveBeenCalledTimes(3)
  })

  it('admits pending copyright families from the daily result and propagates admission failure', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const copyrightId = `data-retention-copyright__${runId}__1`
    onTestFinished(async () => {
      await (await psql.getJob(copyrightId))?.remove()
    })
    const result = {
      ...emptyCleanupResult,
      copyrightFormScreeningAttempts: { scanned: 1, deleted: 1, hasMore: true },
      copyrightActionAttempts: { scanned: 0, deleted: 0, hasMore: false },
    } satisfies Awaited<ReturnType<typeof runDataRetentionCleanup>>
    const cleanup = vi.fn<typeof runDataRetentionCleanup>().mockResolvedValue(result)
    const enqueue = vi.fn<typeof enqueueDataRetentionCleanupContinuation>(async data => {
      await enqueueDataRetentionCleanupContinuation(data)
      throw new Error('admission acknowledgement failed')
    })

    await expect(
      processPsql(
        'dataRetentionCleanup',
        {},
        { dataRetentionCleanup: cleanup, enqueueDataRetentionCleanupContinuation: enqueue },
        initialJobId,
      ),
    ).rejects.toThrow('admission acknowledgement failed')
    expect(enqueue).toHaveBeenCalledExactlyOnceWith({
      runId,
      step: 1,
      activeClassifierSweeps: [],
      activeMembershipFamilies: [],
      activePostModerationKinds: [],
      copyrightFamilies: ['copyrightFormScreeningAttempts'],
    })
    expect((await psql.getJob(copyrightId))?.data).toMatchObject({
      continuation: { copyrightFamilies: ['copyrightFormScreeningAttempts'] },
    })
  })

  it('does not restart a finished independent classifier sweep while another page drains', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2, 3].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    const result = (topicResults: boolean, requests: boolean) =>
      ({
        ...emptyCleanupResult,
        classifierRecords: {
          topicResults: { hasMore: topicResults },
          requests: { hasMore: requests },
        },
      }) as Awaited<ReturnType<typeof runDataRetentionCleanup>>
    const cleanup = vi
      .fn<typeof runDataRetentionCleanup>()
      .mockResolvedValueOnce(result(true, true))
      .mockResolvedValueOnce(result(true, false))
      .mockResolvedValue(result(false, false))

    await processPsql('dataRetentionCleanup', {}, { dataRetentionCleanup: cleanup }, initialJobId)
    const first = await psql.getJob(ids[0]!)
    const firstSweeps = (first!.data as PsqlRetentionJobData).continuation?.activeClassifierSweeps
    expect(firstSweeps).toContain('requests')
    expect(firstSweeps).toContain('topicResults')
    await processPsql(
      'dataRetentionCleanup',
      first?.data as PsqlRetentionJobData,
      {
        dataRetentionCleanup: cleanup,
      },
      first!.id,
    )
    const second = await psql.getJob(ids[1]!)
    const secondSweeps = (second!.data as PsqlRetentionJobData).continuation?.activeClassifierSweeps
    expect(secondSweeps).toContain('topicResults')
    expect(secondSweeps).not.toContain('requests')
    await processPsql(
      'dataRetentionCleanup',
      second?.data as PsqlRetentionJobData,
      {
        dataRetentionCleanup: cleanup,
      },
      second!.id,
    )
    expect(await psql.getJob(ids[2]!)).toBeNull()
    expect(cleanup).toHaveBeenCalledTimes(3)
  })

  it('continues only the membership families that exceeded their cap', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    const result = (effects: boolean, notices: boolean) =>
      ({
        ...emptyCleanupResult,
        classifierRecords: {},
        softDeletedUsers: { deleted: 0, hasMore: false },
        postModerationLedger: noAIRetention.postModerationLedger,
        textEmbeddingCache: { hasMore: false },
        terminalEmbeddingBatches: { hasMore: false },
        oldMediaDeliveryChanges: { hasMore: false },
        deliveredMembershipEntitlementEffects: { hasMore: effects },
        endedMembershipRenewalNotices: { hasMore: notices },
        terminalGooglePlayAcknowledgments: { hasMore: false },
      }) as unknown as Awaited<ReturnType<typeof runDataRetentionCleanup>>
    const cleanup = vi
      .fn<typeof runDataRetentionCleanup>()
      .mockResolvedValueOnce(result(true, true))
      .mockResolvedValueOnce(result(false, true))
      .mockResolvedValue(result(false, false))

    await processPsql('dataRetentionCleanup', {}, { dataRetentionCleanup: cleanup }, initialJobId)
    const first = await psql.getJob(ids[0]!)
    expect(first?.opts.attempts).toBe(3)
    expect((first!.data as PsqlRetentionJobData).continuation?.activeMembershipFamilies).toEqual([
      'deliveredMembershipEntitlementEffects',
      'endedMembershipRenewalNotices',
    ])
    await processPsql(
      'dataRetentionCleanup',
      first?.data as PsqlRetentionJobData,
      { dataRetentionCleanup: cleanup },
      first!.id,
    )
    expect(cleanup.mock.calls[1]?.[1]).toMatchObject({
      activeMembershipFamilies: [
        'deliveredMembershipEntitlementEffects',
        'endedMembershipRenewalNotices',
      ],
    })
    const second = await psql.getJob(ids[1]!)
    expect((second!.data as PsqlRetentionJobData).continuation?.activeMembershipFamilies).toEqual([
      'endedMembershipRenewalNotices',
    ])
  })
})
