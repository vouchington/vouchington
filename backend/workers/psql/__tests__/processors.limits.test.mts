import { onTestFinished, describe, expect, it, vi } from 'vitest'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { dataRetentionConfig, type DataRetentionLimits } from '@services/data-retention/config'
import type { runDataRetentionCleanup } from '@services/data-retention'
import { AI_RETENTION_FAMILIES } from '@queues/psql/types'
import processPsql from '../processors.mts'

const emptyCleanupResult = {
  softDeletedUsers: { deleted: 0, hasMore: false },
  agentModerations: { scanned: 0, deleted: 0, hasMore: false, continuation: null },
  postModerationLedger: { remainingKinds: [], hasMore: false },
  ...Object.fromEntries(AI_RETENTION_FAMILIES.map(family => [family, { hasMore: false }])),
  classifierRecords: { runs: { hasMore: false } },
  supersededVoteBallots: [],
  orphanedUserAgentStrings: { hasMore: false },
  voteIntegrityDetails: { hasMore: false },
  aiUsageRecords: { hasMore: false },
} as unknown as Awaited<ReturnType<typeof runDataRetentionCleanup>>
const dataRetentionCleanup =
  vi.fn<(limits: DataRetentionLimits) => ReturnType<typeof runDataRetentionCleanup>>()

describe('processPsql retention limits', () => {
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
