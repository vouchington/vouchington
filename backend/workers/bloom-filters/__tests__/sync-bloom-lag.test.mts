import type { Job } from 'glide-mq'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BLOOM_FILTER_DEFAULTS,
  blocklistBloomRebuildFollowUpJobId,
  bloomFilterRebuildJobId,
} from '@queues/bloom-filters/config'
import { bloomFilters as bloomQueue } from '@queues/bloom-filters/queues'
import { checkBloomFilters } from '@services/urls-domains-blacklist/bloom-filter'
import { syncDomainsWithDatabase } from '@services/urls-domains-blacklist-sync/sync-db'
import { createTestBlacklistSource, deleteTestBlacklistSource } from '@voucha/test-helpers'
import {
  acquireTestPostgresAdvisoryLock,
  type TestPostgresAdvisoryLock,
} from '@voucha/test-helpers/postgres-advisory-lock'
import { setRebuildBloomFilterProcessorOptions } from '../processors.mts'
import { bloomFilters as bloomWorker } from '../workers.mts'

// One url-blocklist filter and one rebuild job id are shared by every fork.
const URL_BLOCKLIST_REBUILD_LOCK = { namespace: 0x424c4f4d, key: 3517 } as const

const URL_BLOCKLIST_REBUILD_JOB_ID = bloomFilterRebuildJobId('url-blocklist')
const URL_BLOCKLIST_REBUILD_FOLLOW_UP_JOB_ID = blocklistBloomRebuildFollowUpJobId('url-blocklist')

describe('sync bloom lag', () => {
  let rebuildLock: TestPostgresAdvisoryLock | undefined

  beforeAll(async () => {
    rebuildLock = await acquireTestPostgresAdvisoryLock({
      ...URL_BLOCKLIST_REBUILD_LOCK,
      timeout: '4s',
    })
  })

  afterAll(async () => {
    await rebuildLock?.release()
  })

  it('delays the url blocklist rebuild and lets that job complete', async () => {
    const suffix = crypto.randomUUID()
    const domain = `lag-${suffix}.example.com`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `sync-bloom-lag-${sourceNameSuffix()}`,
      url: 'https://example.com/sync-bloom-lag.txt',
    })
    try {
      await settleExistingUrlBlocklistRebuild()
      const completed = watchUrlBlocklistRebuild()
      try {
        await syncDomainsWithDatabase(sourceId, new Response(`${domain}\n`))
        const job = await bloomQueue.getJob(URL_BLOCKLIST_REBUILD_JOB_ID)
        if (!job) throw new Error('url blocklist rebuild was not enqueued')
        expect(job.opts.delay).toBe(BLOOM_FILTER_DEFAULTS.replicaLagSafetyMarginMs)
        await completed.done
      } finally {
        completed.stop()
      }
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })

  it('includes a domain committed while the url blocklist rebuild is active', async () => {
    const suffix = sourceNameSuffix()
    const first = `lag-a-${suffix}.example.com`
    const second = `lag-b-${suffix}.example.com`
    const firstSourceId = await createTestBlacklistSource({
      type: 'url',
      name: `sync-bloom-lag-active-${suffix}`,
      url: 'https://example.com/sync-bloom-lag-active.txt',
    })
    const secondSourceId = await createTestBlacklistSource({
      type: 'url',
      name: `sync-bloom-lag-follow-${suffix}`,
      url: 'https://example.com/sync-bloom-lag-follow.txt',
    })
    let committedSecond = false
    await settleExistingUrlBlocklistRebuild()
    setRebuildBloomFilterProcessorOptions({
      afterSnapshot: async () => {
        if (committedSecond) return
        committedSecond = true
        await syncDomainsWithDatabase(secondSourceId, new Response(`${second}\n`))
      },
    })
    const primary = watchRebuild(URL_BLOCKLIST_REBUILD_JOB_ID)
    const followUp = watchRebuild(URL_BLOCKLIST_REBUILD_FOLLOW_UP_JOB_ID)
    try {
      await syncDomainsWithDatabase(firstSourceId, new Response(`${first}\n`))
      await primary.done
      const followUpJob = await bloomQueue.getJob(URL_BLOCKLIST_REBUILD_FOLLOW_UP_JOB_ID)
      expect(followUpJob).toBeTruthy()
      await followUp.done
      expect(await checkBloomFilters([second])).toEqual([true])
    } finally {
      primary.stop()
      followUp.stop()
      setRebuildBloomFilterProcessorOptions({})
      await deleteTestBlacklistSource(firstSourceId)
      await deleteTestBlacklistSource(secondSourceId)
    }
  })
})

// domain_blocklist_sources.name only allows lowercase letters and hyphens.
function sourceNameSuffix(): string {
  return Array.from(crypto.randomUUID().replaceAll('-', ''), digit =>
    String.fromCodePoint(97 + Number.parseInt(digit, 16)),
  ).join('')
}

function watchRebuild(jobId: string): { done: Promise<void>; stop: () => void } {
  const completed = Promise.withResolvers<void>()
  function stop(): void {
    bloomWorker.off('completed', onCompleted)
    bloomWorker.off('failed', onFailed)
  }
  function onCompleted(job: Job): void {
    if (job.id !== jobId) return
    stop()
    completed.resolve()
  }
  function onFailed(job: Job | undefined, err: Error): void {
    if (job?.id !== jobId) return
    stop()
    completed.reject(err instanceof Error ? err : new Error(String(err)))
  }
  bloomWorker.on('completed', onCompleted)
  bloomWorker.on('failed', onFailed)
  return { done: completed.promise, stop }
}

function watchUrlBlocklistRebuild(): { done: Promise<void>; stop: () => void } {
  return watchRebuild(URL_BLOCKLIST_REBUILD_JOB_ID)
}

async function settleExistingUrlBlocklistRebuild(): Promise<void> {
  const pending = watchUrlBlocklistRebuild()
  try {
    const job = await bloomQueue.getJob(URL_BLOCKLIST_REBUILD_JOB_ID)
    if (!job) return
    const state = await job.getState()
    if (state === 'completed' || state === 'failed' || state === 'unknown') return
    await pending.done
  } finally {
    pending.stop()
  }
}
