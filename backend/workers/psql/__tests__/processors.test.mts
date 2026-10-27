import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { dataRetentionConfig, type DataRetentionLimits } from '@services/data-retention/config'
import type { runDataRetentionCleanup } from '@services/data-retention'
import { psql } from '@queues/psql/queues'
import type { PsqlRetentionJobData } from '@queues/psql/types'
import type { PartitionDropOutcome } from '@data-stores/psql/migration-runner/monthly-partitions'

const cleanupPartitions = vi.fn<() => Promise<PartitionDropOutcome[]>>()
const createPartitions = vi.fn<() => Promise<void>>()
const emptyCleanupResult = {
  classifierRecords: { runs: { hasMore: false } },
} as Awaited<ReturnType<typeof runDataRetentionCleanup>>
const dataRetentionCleanup =
  vi.fn<(limits: DataRetentionLimits) => ReturnType<typeof runDataRetentionCleanup>>()
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
    if (jobName === 'dataRetentionCleanup')
      dataRetentionCleanup.mockResolvedValue(emptyCleanupResult)

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
    dataRetentionCleanup.mockResolvedValue(emptyCleanupResult)
    overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      batch_size: 7,
      max_batches_per_run: 3,
    })

    await processPsql('dataRetentionCleanup', undefined, {
      dataRetentionCleanup: dataRetentionCleanup as never,
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

  it('admits distinct deterministic continuation jobs until the capped sweep converges', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const continuationIds = [1, 2, 3].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(continuationIds.map(async id => (await psql.getJob(id))?.remove()))
    })
    const hasMore = {
      classifierRecords: { runs: { hasMore: true } },
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

  it('does not restart a finished independent classifier sweep while another page drains', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2, 3].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    const result = (topicResults: boolean, requests: boolean) =>
      ({
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
