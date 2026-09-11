import { describe, expect, it } from 'vitest'
import { enqueueRefreshMaterializedView, enqueueReconcileVoteDrift } from './enqueues.mts'

describe('enqueueRefreshMaterializedView', () => {
  it('enqueues a refreshMaterializedView job for the given view without throwing', async () => {
    await expect(enqueueRefreshMaterializedView('mv_rss_feed_crawl_tiers')).resolves.toBeDefined()
  })
})

describe('enqueueReconcileVoteDrift', () => {
  it('enqueues a reconcileVoteDrift job without throwing', async () => {
    await expect(enqueueReconcileVoteDrift()).resolves.toBeDefined()
  })
})
