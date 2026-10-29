import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  beginTransaction,
  createTestExpiryWindow,
  getDeletedConversationDescendantCountsForTest,
  insertDeletedConversationFixtureForTest,
  insertDeletedConversationNotificationForTest,
  operationalRowExistsForTest,
} from '@voucha/test-helpers'
import {
  deleteDeletedConversationFixtureForTest,
  lockDeletedConversationNotificationForTest,
} from '@voucha/test-helpers/deleted-conversation-retention-lock'
import { createScopedDeletedConversationRetentionForTest } from '@voucha/test-helpers/deleted-conversation-retention-scope'
import { openDeletedConversationRetentionQueueForTest } from '@voucha/test-helpers/deleted-conversation-retention-queue'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { dataRetentionConfig, getDataRetentionLimits } from '@services/data-retention/config'
import type { cleanupOperationalTombstones } from '@services/data-retention/cleanup-operational-tombstones'
import { operationalTombstoneRetentionJobId } from '@queues/psql/config'

const deletedConversationRetentionJobId =
  operationalTombstoneRetentionJobId('deleted_conversations')

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('deleted conversation native continuation', () => {
  it('completes a locked pass once and resumes from a later admission after release', async () => {
    const window = createTestExpiryWindow()
    const conversation = await (async () => {
      await using setup = await beginTransaction()
      const fixture = await insertDeletedConversationFixtureForTest(setup, {
        deletedAt: window.firstEligibleDate,
        withChildren: true,
      })
      await setup.commit()
      return fixture
    })()
    onTestFinished(async () => {
      await using cleanup = await beginTransaction()
      await deleteDeletedConversationFixtureForTest(cleanup, conversation)
      await cleanup.commit()
    })
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      batch_size: 1,
      max_batches_per_run: 1,
    })
    onTestFinished(restore)
    await using blocker = await beginTransaction()
    await lockDeletedConversationNotificationForTest(blocker, conversation)
    let released = false
    let runs = 0
    const pages: Awaited<ReturnType<typeof cleanupOwned>>[] = []
    const cleanupOwned = createScopedDeletedConversationRetentionForTest(
      [conversation.id],
      new Date(window.upperBoundDate.getTime() + 30 * 86_400_000),
    )
    const cleanupFamily: typeof cleanupOperationalTombstones = async (_family, limits) => {
      runs += 1
      const result = await cleanupOwned(limits)
      pages.push(result)
      return result
    }
    const harness = await openDeletedConversationRetentionQueueForTest(cleanupFamily, async () => ({
      deletedConversations: await cleanupOwned(getDataRetentionLimits()),
    }))
    try {
      const first = harness.nextTerminal()
      await harness.admit()
      await expect(first).resolves.toBe('completed')
      expect(pages).toEqual([{ deleted: 0, hasMore: true, continuation: null, stalled: true }])
      expect(runs).toBe(1)
      await expect(harness.runDaily()).resolves.toBe('completed')
      const retainedAfterStall = await harness.queue.getJob(deletedConversationRetentionJobId)
      expect(await retainedAfterStall?.getState()).toBe('completed')
      expect(runs).toBe(1)
      expect(await operationalRowExistsForTest(blocker, 'conversations', conversation.id)).toBe(
        true,
      )
      expect((await harness.queue.getJobCounts()).delayed).toBe(0)
      await blocker.commit()
      released = true
      const resumed = harness.nextTerminal()
      expect(await harness.admit()).toHaveLength(1)
      await expect(resumed).resolves.toBe('completed')
      expect(pages.at(-1)?.hasMore).toBe(false)
      expect(runs).toBeGreaterThan(1)
      await using assertion = await beginTransaction()
      expect(await operationalRowExistsForTest(assertion, 'conversations', conversation.id)).toBe(
        false,
      )
    } finally {
      if (!released) await blocker.commit()
      await harness.close()
    }
  })

  it('keeps one active family job, yields bounded real SQL pages, and reactivates after completion', async () => {
    const window = createTestExpiryWindow()
    const conversation = await (async () => {
      await using setup = await beginTransaction()
      const fixture = await insertDeletedConversationFixtureForTest(setup, {
        deletedAt: window.firstEligibleDate,
        withChildren: true,
      })
      await insertDeletedConversationNotificationForTest(setup, fixture)
      await setup.commit()
      return fixture
    })()
    onTestFinished(async () => {
      await using cleanup = await beginTransaction()
      await deleteDeletedConversationFixtureForTest(cleanup, conversation)
      await cleanup.commit()
    })
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      batch_size: 1,
      max_batches_per_run: 1,
    })
    onTestFinished(restore)
    const pages: Awaited<ReturnType<typeof cleanupOwned>>[] = []
    const cleanupOwned = createScopedDeletedConversationRetentionForTest(
      [conversation.id],
      new Date(window.upperBoundDate.getTime() + 30 * 86_400_000),
    )
    let runs = 0
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const cleanupFamily: typeof cleanupOperationalTombstones = async (_family, limits) => {
      runs += 1
      if (runs === 1) {
        entered.resolve()
        await release.promise
      }
      const result = await cleanupOwned(limits)
      pages.push(result)
      return result
    }
    const harness = await openDeletedConversationRetentionQueueForTest(cleanupFamily, async () => ({
      deletedConversations: await cleanupOwned(getDataRetentionLimits()),
    }))
    try {
      const completed = harness.nextTerminal()
      await expect(harness.runDaily()).resolves.toBe('completed')
      await waitForRealGlideEvent(entered.promise, 'conversation retention active admission')
      expect(await harness.admit()).toHaveLength(0)
      const admitted = await harness.queue.getJob(deletedConversationRetentionJobId)
      expect(admitted?.opts).toMatchObject({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        ordering: {
          key: 'psql:operational-tombstone-retention:deleted_conversations',
          concurrency: 1,
        },
      })
      release.resolve()
      await expect(completed).resolves.toBe('completed')
      expect(runs).toBeGreaterThan(1)
      expect(pages.at(-1)?.hasMore).toBe(false)
      await using assertion = await beginTransaction()
      expect(await operationalRowExistsForTest(assertion, 'conversations', conversation.id)).toBe(
        false,
      )
      expect(
        (await getDeletedConversationDescendantCountsForTest(assertion, conversation.id)).messages,
      ).toBe(0)
      const completedRuns = runs
      await expect(harness.runDaily()).resolves.toBe('completed')
      const retainedAfterDrain = await harness.queue.getJob(deletedConversationRetentionJobId)
      expect(await retainedAfterDrain?.getState()).toBe('completed')
      expect(runs).toBe(completedRuns)
      const next = harness.nextTerminal()
      expect(await harness.admit()).toHaveLength(1)
      await expect(next).resolves.toBe('completed')
      expect((await harness.queue.getJob(deletedConversationRetentionJobId))?.attemptsMade).toBe(0)
    } finally {
      release.resolve()
      await harness.close()
    }
  })

  it('admits each productive operational family and leaves stalled families for the next daily pass', async () => {
    const processed: string[] = []
    const cleanupFamily: typeof cleanupOperationalTombstones = async family => {
      processed.push(family)
      return { deleted: 0, hasMore: false, continuation: null, stalled: false }
    }
    const pending = { deleted: 0, hasMore: true, continuation: null, stalled: false }
    const harness = await openDeletedConversationRetentionQueueForTest(cleanupFamily, async () => ({
      staleRemoteActors: pending,
      appAttestationKeys: pending,
      feedHostnameBlocks: { ...pending, stalled: true },
    }))
    try {
      const actorDone = harness.nextTerminal('remote_actors')
      const attestationDone = harness.nextTerminal('app_attestation_keys')
      await expect(harness.runDaily()).resolves.toBe('completed')
      await expect(actorDone).resolves.toBe('completed')
      await expect(attestationDone).resolves.toBe('completed')
      expect(processed.toSorted()).toEqual(['app_attestation_keys', 'remote_actors'])
      expect(
        await harness.queue.getJob(operationalTombstoneRetentionJobId('feed_hostname_blocks')),
      ).toBeNull()
      for (const family of ['remote_actors', 'app_attestation_keys'] as const)
        expect(
          (await harness.queue.getJob(operationalTombstoneRetentionJobId(family)))?.opts,
        ).toMatchObject({
          ordering: { key: `psql:operational-tombstone-retention:${family}`, concurrency: 1 },
        })
    } finally {
      await harness.close()
    }
  })
})
