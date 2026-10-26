import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { psql as psqlQueue } from '@queues/psql/queues'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { dataRetentionConfig, type DataRetentionLimits } from '@services/data-retention/config'
import type { PartitionDropOutcome } from '@data-stores/psql/migration-runner/monthly-partitions'

const cleanupPartitions = vi.fn<() => Promise<PartitionDropOutcome[]>>()
const createPartitions = vi.fn<() => Promise<void>>()
const dataRetentionCleanup = vi.fn<(limits: DataRetentionLimits) => Promise<void>>()
const reconcileVoteDrift = vi.fn<() => Promise<void>>()
const refreshMaterializedView = vi.fn<(viewName: string) => Promise<void>>()
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

    await processPsql(jobName, undefined, {
      cleanupPartitions,
      createPartitions,
      dataRetentionCleanup: dataRetentionCleanup as never,
      reconcileVoteDrift: reconcileVoteDrift as never,
      runConfigDriven,
      runMigrations,
      runViews,
    })

    expect(processor).toHaveBeenCalledOnce()
  })

  it('passes the data-retention-config limits to every retention cleanup', async () => {
    dataRetentionCleanup.mockReset()
    overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      batch_size: 7,
      max_batches_per_run: 3,
    })

    await processPsql('dataRetentionCleanup', undefined, {
      dataRetentionCleanup: dataRetentionCleanup as never,
    })

    expect(dataRetentionCleanup).toHaveBeenCalledExactlyOnceWith({ batchSize: 7, maxBatches: 3 })
  })

  it.each([
    ['deliveredMembershipEntitlementEffects', true],
    ['endedMembershipRenewalNotices', true],
    ['terminalGooglePlayAcknowledgments', true],
    ['none', false],
  ] as const)(
    'admits a retention continuation for %s remaining work',
    async (remaining, expected) => {
      const parentJobId = `membership-retention-test__${randomUUID()}`
      const childJobId = `data-retention-continuation__${createHash('sha256').update(parentJobId).digest('hex')}`
      onTestFinished(async () => {
        const child = await psqlQueue.getJob(childJobId)
        await child?.remove()
      })
      const result = {
        deliveredMembershipEntitlementEffects: {
          hasMore: remaining === 'deliveredMembershipEntitlementEffects',
        },
        endedMembershipRenewalNotices: { hasMore: remaining === 'endedMembershipRenewalNotices' },
        terminalGooglePlayAcknowledgments: {
          hasMore: remaining === 'terminalGooglePlayAcknowledgments',
        },
      }
      await processPsql(
        'dataRetentionCleanup',
        undefined,
        { dataRetentionCleanup: async () => result as never },
        parentJobId,
      )
      expect((await psqlQueue.getJob(childJobId)) !== null).toBe(expected)
    },
  )

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
    dataRetentionCleanup.mockResolvedValue()

    const processing = processPsql('dataRetentionCleanup', undefined, {
      dataRetentionCleanup: dataRetentionCleanup as never,
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

  it('calls runConfigDriven when the job name is runConfigDriven', async () => {
    runConfigDriven.mockReset()
    runConfigDriven.mockResolvedValue()
    await processPsql('runConfigDriven', undefined, { runConfigDriven })
    expect(runConfigDriven).toHaveBeenCalledOnce()
  })

  it('throws when refreshMaterializedView is missing data.viewName', async () => {
    refreshMaterializedView.mockReset()
    await expect(
      processPsql('refreshMaterializedView', {}, { refreshMaterializedView }),
    ).rejects.toThrow('refreshMaterializedView job requires data.viewName')
    expect(refreshMaterializedView).not.toHaveBeenCalled()
  })

  it('refreshes the materialized view when given a viewName', async () => {
    refreshMaterializedView.mockReset()
    refreshMaterializedView.mockResolvedValue()

    await processPsql(
      'refreshMaterializedView',
      { viewName: 'mv_rss_feed_crawl_tiers' },
      { refreshMaterializedView },
    )

    expect(refreshMaterializedView).toHaveBeenCalledWith('mv_rss_feed_crawl_tiers')
  })

  it('throws on an unknown job name', async () => {
    await expect(processPsql('unknownJob' as never)).rejects.toThrow('Unknown job: unknownJob')
  })
})
