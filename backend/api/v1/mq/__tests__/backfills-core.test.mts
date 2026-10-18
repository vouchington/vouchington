import { describe, expect, it } from 'vitest'

import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { CORE_BACKFILLS } from '@services/queue-monitoring/backfills-core'

describe('CORE_BACKFILLS', () => {
  it('advertises the registered CPU job names for language backfills', () => {
    const backfills = CORE_BACKFILLS.filter(entry => entry.id.startsWith('language-detection-'))

    expect(backfills).toHaveLength(6)
    for (const backfill of backfills) {
      expect(backfill.queue_name).toBe(BACKGROUND_CPU_QUEUE_NAME)
      expect(requireBackgroundCpuJob(backfill.job_name).name).toBe(backfill.job_name)
    }
  })

  it('registers classifier run recovery for operators', () => {
    const backfill = CORE_BACKFILLS.find(entry => entry.id === 'classifier-runs')

    expect(backfill).toMatchObject({
      queue_name: 'ai_agents',
      job_name: 'reconcile-classifier-runs',
      source_table: 'classifier_runs',
    })
    expect(typeof backfill?.trigger).toBe('function')
  })

  it('registers follower distribution backfill trigger', () => {
    const backfill = CORE_BACKFILLS.find(entry => entry.id === 'follower-distributions')

    expect(backfill).toMatchObject({
      queue_name: 'background',
      job_name: 'follower-distributions.backfillFollowerDistributions',
      source_table: 'follower_distributions',
    })
    expect(typeof backfill?.trigger).toBe('function')
  })

  it('registers a separate read-only post-publication shadow-audit trigger', () => {
    const backfill = CORE_BACKFILLS.find(entry => entry.id === 'post-publication-shadow-dry-run')

    expect(backfill).toMatchObject({
      queue_name: 'background',
      job_name: 'post-publication.shadow-audit',
      description: expect.stringContaining('dry run'),
      source_table: 'posts,post_publication_reconciliation_audit_cursors',
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
      queue_name: 'background',
      job_name: 'post-publication.audit-review-succession-history',
      source_table: 'posts,post_review_topic_ratings,review_successions',
    })
    expect(typeof backfill?.trigger).toBe('function')
  })
})
