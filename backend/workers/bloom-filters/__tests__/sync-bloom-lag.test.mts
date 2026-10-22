import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { BLOOM_FILTER_DEFAULTS } from '@queues/bloom-filters/config'
import { bloomFilters as bloomQueue } from '@queues/bloom-filters/queues'
import { syncDomainsWithDatabase } from '@services/urls-domains-blacklist-sync/sync-db'
import { createTestBlacklistSource, deleteTestBlacklistSource } from '@voucha/test-helpers'
import { bloomFilters as bloomWorker } from '../workers.mts'

const URL_BLOCKLIST_REBUILD_JOB_ID = 'bloomFilterRebuild__url-blocklist'

describe('sync bloom lag', () => {
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
})

// domain_blocklist_sources.name only allows lowercase letters and hyphens.
function sourceNameSuffix(): string {
  return Array.from(crypto.randomUUID().replaceAll('-', ''), digit =>
    String.fromCodePoint(97 + Number.parseInt(digit, 16)),
  ).join('')
}

function watchUrlBlocklistRebuild(): { done: Promise<void>; stop: () => void } {
  const completed = Promise.withResolvers<void>()
  function stop(): void {
    bloomWorker.off('completed', onCompleted)
    bloomWorker.off('failed', onFailed)
  }
  function onCompleted(job: Job): void {
    if (job.id !== URL_BLOCKLIST_REBUILD_JOB_ID) return
    stop()
    completed.resolve()
  }
  function onFailed(job: Job | undefined, err: Error): void {
    if (job?.id !== URL_BLOCKLIST_REBUILD_JOB_ID) return
    stop()
    completed.reject(err instanceof Error ? err : new Error(String(err)))
  }
  bloomWorker.on('completed', onCompleted)
  bloomWorker.on('failed', onFailed)
  return { done: completed.promise, stop }
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
