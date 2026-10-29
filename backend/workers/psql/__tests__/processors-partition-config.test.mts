import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { dataRetentionConfig } from '@services/data-retention/config'
import type { cleanupPartitions as cleanupPartitionsService } from '@data-stores/psql/migration-runner/monthly-partitions'
import processPsql from '../processors.mts'

const cleanupPartitions = vi.fn<typeof cleanupPartitionsService>()

describe('partition cleanup config', () => {
  it('loads the bounded partition feedback page size before cleanup', async () => {
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
    cleanupPartitions.mockReset()
    cleanupPartitions.mockResolvedValue({ outcomes: [], hasMore: false })

    const processing = processPsql('cleanupPartitions', undefined, { cleanupPartitions })
    try {
      expect(cleanupPartitions).not.toHaveBeenCalled()
      overrideDynamicConfigFieldsForTest(dataRetentionConfig, { batch_size: 7 })
      initialized.resolve()
      await processing
      expect(cleanupPartitions).toHaveBeenCalledExactlyOnceWith(
        expect.any(Date),
        expect.objectContaining({ feedbackBatchSize: 7 }),
      )
    } finally {
      initialized.resolve()
      await processing
    }
  })
})
