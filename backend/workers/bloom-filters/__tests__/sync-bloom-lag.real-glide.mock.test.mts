import type { Job, Worker } from 'glide-mq'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createBatchWorker } from '@data-stores/valkey-glide-mq'
import {
  BLOOM_FILTER_LOCK_DURATION_MS,
  blocklistBloomRebuildFollowUpJobId,
  bloomFilterRebuildJobId,
  QUEUE_NAME,
  rebuildBloomFilterJobOptions,
} from '@queues/bloom-filters/config'
import { bloomFilters as bloomQueue } from '@queues/bloom-filters/queues'
import type { RebuildBloomFilterData } from '@queues/bloom-filters/types'
import { checkBloomFilters } from '@services/urls-domains-blacklist/bloom-filter'
import { withBlocklistBloomFilterLock } from '@services/urls-domains-blacklist/bloom-filter-lock'
import {
  bumpBlocklistBloomGeneration,
  rebuildCurrentBlocklistBloomFilter,
} from '@services/urls-domains-blacklist/bloom-rebuild'
import { syncDomainsWithDatabase } from '@services/urls-domains-blacklist-sync/sync-db'
import { createTestBlacklistSource, deleteTestBlacklistSource } from '@voucha/test-helpers'
import {
  acquireTestPostgresAdvisoryLock,
  type TestPostgresAdvisoryLock,
} from '@voucha/test-helpers/postgres-advisory-lock'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { processBatchSettled } from '../processors/process-batch-settled.mts'
import { processRebuildBloomFilter } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

// One url-blocklist filter and one rebuild job id are shared with the in-memory lag tests.
const URL_BLOCKLIST_REBUILD_LOCK = { namespace: 0x424c4f4d, key: 3517 } as const
const URL_BLOCKLIST_REBUILD_JOB_ID = bloomFilterRebuildJobId('url-blocklist')
const URL_BLOCKLIST_REBUILD_FOLLOW_UP_JOB_ID = blocklistBloomRebuildFollowUpJobId('url-blocklist')
const GLIDE_EVENT_DEADLINE_MS = 4_000
let worker: Worker | undefined

describe('sync bloom lag on real GlideMQ', () => {
  let rebuildLock: TestPostgresAdvisoryLock | undefined

  beforeAll(async () => {
    rebuildLock = await acquireTestPostgresAdvisoryLock({
      ...URL_BLOCKLIST_REBUILD_LOCK,
      timeout: '4s',
    })
    worker = createBatchWorker(
      QUEUE_NAME,
      (jobs: Job[]) =>
        processBatchSettled(jobs, async job => {
          if (job.name !== 'processRebuildBloomFilter') {
            throw new Error(`Bloom filter job ${job.name} not found`)
          }
          await processRebuildBloomFilter(job.data as RebuildBloomFilterData)
        }),
      {
        concurrency: 5,
        lockDuration: BLOOM_FILTER_LOCK_DURATION_MS,
        batch: { size: 10, timeout: 1000 },
        blockTimeout: 100,
        // Ranked jobs stay on the scheduled set until a promotion tick. The default tick is 5s.
        promotionInterval: 1,
      },
    )
    worker.on('error', () => undefined)
    await worker.waitUntilReady()
  })

  afterAll(async () => {
    await worker?.close(true)
    await rebuildLock?.release()
    await bloomQueue.close()
  })

  it('admits a commit made outside the rebuild while its follow-up is group-waiting', async () => {
    const suffix = sourceNameSuffix()
    const domain = `lag-x-${suffix}.example.com`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `sync-bloom-lag-cross-${suffix}`,
      url: 'https://example.com/sync-bloom-lag-cross.txt',
    })
    await removeUrlBlocklistJobs()
    const held = holdUrlBlocklistLock()
    try {
      await held.ready
      await parkGroupWaitingFollowUp(requireWorker())
      const followUp = await bloomQueue.getJob(URL_BLOCKLIST_REBUILD_FOLLOW_UP_JOB_ID)
      if (!followUp) throw new Error('follow-up rebuild was not parked')
      const delay = followUp.opts.delay ?? 0
      await syncDomainsWithDatabase(sourceId, new Response(`${domain}\n`))
      const queued = await bloomQueue.getJob(URL_BLOCKLIST_REBUILD_FOLLOW_UP_JOB_ID)
      expect(await queued?.getState()).toBe('group-waiting')
      expect(queued?.opts.delay ?? 0).toBe(delay)
      await queued?.remove()
      await held.release()
      await onceTerminal(requireWorker(), URL_BLOCKLIST_REBUILD_JOB_ID, 'completed')
      expect(await checkBloomFilters([domain])).toEqual([true])
    } finally {
      await held.release()
      await removeUrlBlocklistJobs()
      await deleteTestBlacklistSource(sourceId)
    }
  })

  it('does not throw when a failed compare-and-set finds the follow-up group-waiting', async () => {
    await removeUrlBlocklistJobs()
    const held = holdUrlBlocklistLock()
    try {
      await held.ready
      await bumpBlocklistBloomGeneration('url-blocklist')
      await parkGroupWaitingFollowUp(requireWorker())
      await expect(
        rebuildCurrentBlocklistBloomFilter({
          filter: 'url-blocklist',
          readyKey: 'bloom-filter:url-blocklist:ready:cas-group-waiting',
          stream: async () => {
            await bumpBlocklistBloomGeneration('url-blocklist')
          },
        }),
      ).resolves.toBeUndefined()
      const followUp = await bloomQueue.getJob(URL_BLOCKLIST_REBUILD_FOLLOW_UP_JOB_ID)
      expect(await followUp?.getState()).toBe('group-waiting')
      await bumpBlocklistBloomGeneration('url-blocklist', '999999999999999')
      await (await bloomQueue.getJob(URL_BLOCKLIST_REBUILD_FOLLOW_UP_JOB_ID))?.remove()
      await held.release()
      await onceTerminal(requireWorker(), URL_BLOCKLIST_REBUILD_JOB_ID, 'completed')
    } finally {
      await held.release()
      await bumpBlocklistBloomGeneration('url-blocklist')
      await removeUrlBlocklistJobs()
    }
  })
})

function requireWorker(): Worker {
  if (!worker) throw new Error('bloom worker was not started')
  return worker
}

// domain_blocklist_sources.name only allows lowercase letters and hyphens.
function sourceNameSuffix(): string {
  return Array.from(crypto.randomUUID().replaceAll('-', ''), digit =>
    String.fromCodePoint(97 + Number.parseInt(digit, 16)),
  ).join('')
}

function holdUrlBlocklistLock(): { ready: Promise<void>; release: () => Promise<void> } {
  const started = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  let finished = false
  const held = withBlocklistBloomFilterLock('url-blocklist', async () => {
    started.resolve()
    await released.promise
  })
  return {
    ready: started.promise,
    release: async () => {
      if (finished) return
      finished = true
      released.resolve()
      await held
    },
  }
}

async function parkGroupWaitingFollowUp(bloomWorker: Worker): Promise<void> {
  const active = onceActive(bloomWorker, URL_BLOCKLIST_REBUILD_JOB_ID)
  const primary = await bloomQueue.add(
    'processRebuildBloomFilter',
    { filter: 'url-blocklist' },
    parkedRebuildOptions(URL_BLOCKLIST_REBUILD_JOB_ID),
  )
  if (!primary) throw new Error('url blocklist rebuild was not enqueued')
  await active
  const followUp = await bloomQueue.add(
    'processRebuildBloomFilter',
    { filter: 'url-blocklist' },
    parkedRebuildOptions(URL_BLOCKLIST_REBUILD_FOLLOW_UP_JOB_ID),
  )
  if (!followUp) throw new Error('follow-up rebuild was not enqueued')
  const barrierId = `bloom-lag-barrier-${crypto.randomUUID()}`
  const barrierFailed = onceTerminal(bloomWorker, barrierId, 'failed')
  const barrier = await bloomQueue.add(
    'bloom-lag-barrier',
    {},
    {
      jobId: barrierId,
      delay: 0,
      priority: 2048,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
      ordering: { key: barrierId, concurrency: 1 },
    },
  )
  if (!barrier) throw new Error('barrier job was not enqueued')
  await barrierFailed
  const parked = await bloomQueue.getJob(URL_BLOCKLIST_REBUILD_FOLLOW_UP_JOB_ID)
  expect(await parked?.getState()).toBe('group-waiting')
}

function parkedRebuildOptions(jobId: string): ReturnType<typeof rebuildBloomFilterJobOptions> {
  return {
    ...rebuildBloomFilterJobOptions({ filter: 'url-blocklist' }),
    jobId,
    delay: 0,
    priority: 1,
    attempts: 1,
  }
}

async function removeUrlBlocklistJobs(): Promise<void> {
  await (await bloomQueue.getJob(URL_BLOCKLIST_REBUILD_JOB_ID))?.remove()
  await (await bloomQueue.getJob(URL_BLOCKLIST_REBUILD_FOLLOW_UP_JOB_ID))?.remove()
}

function onceActive(bloomWorker: Worker, jobId: string): Promise<void> {
  const pending = Promise.withResolvers<void>()
  function onActive(job: Job): void {
    if (job.id !== jobId) return
    cleanup()
    pending.resolve()
  }
  function onFailed(job: Job | undefined, err: Error): void {
    if (job?.id !== jobId) return
    cleanup()
    pending.reject(err instanceof Error ? err : new Error(String(err)))
  }
  function cleanup(): void {
    bloomWorker.off('active', onActive)
    bloomWorker.off('failed', onFailed)
  }
  bloomWorker.on('active', onActive)
  bloomWorker.on('failed', onFailed)
  return waitForRealGlideEvent(
    pending.promise,
    `GlideMQ job ${jobId} active`,
    GLIDE_EVENT_DEADLINE_MS,
  ).finally(cleanup)
}

function onceTerminal(
  bloomWorker: Worker,
  jobId: string,
  outcome: 'completed' | 'failed',
): Promise<void> {
  const pending = Promise.withResolvers<void>()
  function onCompleted(job: Job): void {
    if (job.id !== jobId) return
    cleanup()
    if (outcome === 'completed') pending.resolve()
    else pending.reject(new Error(`${jobId} completed`))
  }
  function onFailed(job: Job | undefined, err: Error): void {
    if (job?.id !== jobId) return
    cleanup()
    if (outcome === 'failed') pending.resolve()
    else pending.reject(err instanceof Error ? err : new Error(String(err)))
  }
  function cleanup(): void {
    bloomWorker.off('completed', onCompleted)
    bloomWorker.off('failed', onFailed)
  }
  bloomWorker.on('completed', onCompleted)
  bloomWorker.on('failed', onFailed)
  return waitForRealGlideEvent(
    pending.promise,
    `GlideMQ job ${jobId}`,
    GLIDE_EVENT_DEADLINE_MS,
  ).finally(cleanup)
}
