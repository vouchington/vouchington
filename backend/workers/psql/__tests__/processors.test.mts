import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { dataRetentionConfig, type DataRetentionLimits } from '@services/data-retention/config'
import type { runDataRetentionCleanup } from '@services/data-retention'
import { AI_RETENTION_FAMILIES } from '@queues/psql/types'
import type { cleanupPartitions as cleanupPartitionsService } from '@data-stores/psql/migration-runner/monthly-partitions'

const cleanupPartitions = vi.fn<typeof cleanupPartitionsService>()
const createPartitions = vi.fn<() => Promise<void>>()
const noPostModerationRetention: Awaited<
  ReturnType<typeof runDataRetentionCleanup>
>['postModerationLedger'] = {
  deletedVersions: 0,
  clearedPassEvidence: 0,
  hasMore: false,
  remainingKinds: [],
}
const noAIRetention = {
  softDeletedUsers: { deleted: 0, hasMore: false },
  postModerationLedger: noPostModerationRetention,
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
const dataRetentionCleanup =
  vi.fn<(limits: DataRetentionLimits) => ReturnType<typeof runDataRetentionCleanup>>()
const reconcileVoteDrift = vi.fn<() => Promise<void>>()
const runConfigDriven = vi.fn<() => Promise<void>>()
const runMigrations = vi.fn<() => Promise<void>>()
const runViews = vi.fn<() => Promise<void>>()
import processPsql from '../processors.mts'

describe('processPsql', () => {
  it.each([
    ['runMigrations', runMigrations],
    ['runViews', runViews],
    ['runConfigDriven', runConfigDriven],
    ['createPartitions', createPartitions],
    ['cleanupPartitions', cleanupPartitions],
    ['dataRetentionCleanup', dataRetentionCleanup],
    ['reconcileVoteDrift', reconcileVoteDrift],
  ] as const)('calls %s when selected', async (jobName, processor) => {
    processor.mockReset()
    if (jobName === 'dataRetentionCleanup')
      dataRetentionCleanup.mockResolvedValue(emptyCleanupResult)
    if (jobName === 'cleanupPartitions')
      cleanupPartitions.mockResolvedValue({ outcomes: [], hasMore: false })

    await processPsql(jobName, undefined, {
      cleanupPartitions,
      createPartitions,
      dataRetentionCleanup,
      reconcileVoteDrift: reconcileVoteDrift as never,
      runConfigDriven,
      runMigrations,
      runViews,
    })

    expect(processor).toHaveBeenCalledOnce()
  })

  it('passes the data-retention-config limits to every retention cleanup', async () => {
    dataRetentionCleanup.mockReset()
    dataRetentionCleanup.mockResolvedValue(emptyCleanupResult)
    overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      batch_size: 7,
      max_batches_per_run: 3,
    })

    await processPsql('dataRetentionCleanup', undefined, {
      dataRetentionCleanup,
    })

    expect(dataRetentionCleanup).toHaveBeenCalledExactlyOnceWith({ batchSize: 7, maxBatches: 3 })
  })

  it('waits for stored retention limits to load on a cold start', async () => {
    await dataRetentionConfig.waitForInitialization()
    const restoreFields = deleteDynamicConfigFieldsForTest(
      dataRetentionConfig,
      Object.keys(dataRetentionConfig.fieldTypes),
    )
    onTestFinished(() => {
      restoreFields()
      vi.restoreAllMocks()
    })
    const initialized = Promise.withResolvers<void>()
    vi.spyOn(dataRetentionConfig, 'waitForInitialization').mockReturnValue(initialized.promise)
    dataRetentionCleanup.mockReset()
    dataRetentionCleanup.mockResolvedValue(emptyCleanupResult)

    const processing = processPsql('dataRetentionCleanup', undefined, {
      dataRetentionCleanup,
    })
    try {
      expect(dataRetentionCleanup).not.toHaveBeenCalled()
      overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
        batch_size: 7,
        max_batches_per_run: 3,
      })
      initialized.resolve()
      await processing
      expect(dataRetentionCleanup).toHaveBeenCalledExactlyOnceWith({ batchSize: 7, maxBatches: 3 })
    } finally {
      initialized.resolve()
      await processing
    }
  })
})
