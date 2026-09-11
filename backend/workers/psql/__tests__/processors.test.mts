import { describe, expect, it, vi } from 'vitest'

const cleanupPartitions = vi.fn<() => Promise<void>>()
const createPartitions = vi.fn<() => Promise<void>>()
const dataRetentionCleanup = vi.fn<() => Promise<void>>()
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
    processor.mockResolvedValue()

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
