import { beforeEach, describe, expect, it, vi } from 'vitest'
import processPsql from '../processors.mts'

const runConfigDriven = vi.fn<() => Promise<void>>()
const refreshMaterializedView = vi.fn<(viewName: string) => Promise<void>>()

describe('PostgreSQL processor routing', () => {
  beforeEach(() => {
    runConfigDriven.mockReset()
    refreshMaterializedView.mockReset()
  })

  it('calls runConfigDriven when the job name is runConfigDriven', async () => {
    runConfigDriven.mockResolvedValue()
    await processPsql('runConfigDriven', undefined, { runConfigDriven })
    expect(runConfigDriven).toHaveBeenCalledOnce()
  })

  it('throws when refreshMaterializedView is missing data.viewName', async () => {
    await expect(
      processPsql('refreshMaterializedView', {}, { refreshMaterializedView }),
    ).rejects.toThrow('refreshMaterializedView job requires data.viewName')
    expect(refreshMaterializedView).not.toHaveBeenCalled()
  })

  it('refreshes the materialized view when given a viewName', async () => {
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
