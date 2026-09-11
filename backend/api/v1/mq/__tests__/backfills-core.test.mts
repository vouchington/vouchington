import { describe, expect, it } from 'vitest'

import { CORE_BACKFILLS } from '../backfills-core.mts'

describe('CORE_BACKFILLS', () => {
  it('registers follower distribution backfill trigger', () => {
    const backfill = CORE_BACKFILLS.find(entry => entry.id === 'follower-distributions')

    expect(backfill).toMatchObject({
      queue_name: 'follower-distributions',
      job_name: 'backfillFollowerDistributions',
      source_table: 'follower_distributions',
    })
    expect(typeof backfill?.trigger).toBe('function')
  })

  it('registers a separate read-only post-publication shadow-audit trigger', () => {
    const backfill = CORE_BACKFILLS.find(entry => entry.id === 'post-publication-shadow-dry-run')

    expect(backfill).toMatchObject({
      queue_name: 'post-publication',
      job_name: 'processShadowAuditPostPublication',
      description: expect.stringContaining('dry run'),
      source_table: 'posts,post_publication_reconciliation_audit_checkpoints',
    })
    expect(typeof backfill?.trigger).toBe('function')
  })

  it('triggers post-publication shadow repair mode explicitly', async () => {
    const backfill = CORE_BACKFILLS.find(entry => entry.id === 'post-publication-shadow-repair')

    await expect(backfill?.trigger()).resolves.toBeDefined()
  })

  it('registers the review succession history audit as a read-only operator backfill', () => {
    const backfill = CORE_BACKFILLS.find(entry => entry.id === 'review-succession-history-dry-run')

    expect(backfill).toMatchObject({
      queue_name: 'post-publication',
      job_name: 'processAuditReviewSuccessionHistory',
      source_table: 'posts,post_review_topic_ratings,review_successions',
    })
    expect(typeof backfill?.trigger).toBe('function')
  })
})
