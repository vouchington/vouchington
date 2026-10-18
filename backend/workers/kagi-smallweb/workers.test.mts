import { kagiSmallWeb } from '@queues/kagi-smallweb/queues'
import { describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import {
  KAGI_SMALLWEB_PROCESS_FEED_JOB,
  KAGI_SMALLWEB_SYNC_JOB,
} from '@queues/background/enqueues/kagi-smallweb-jobs'
import { kagiSmallWebHandlers } from './workers.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

async function run(name: string, data: unknown) {
  const handler = kagiSmallWebHandlers.find(candidate => candidate.job.name === name)
  if (!handler) throw new Error(`No kagi-smallweb handler for ${name}`)
  const job = await kagiSmallWeb.add(name, data)
  if (!job) throw new Error('Expected Kagi job admission')
  return handler.handle(job as Job<never>)
}

describe('kagiSmallWebHandlers', () => {
  it('registers one handler for every kagi-smallweb job', () => {
    expect(kagiSmallWebHandlers.map(handler => handler.job.name).toSorted()).toEqual([
      'kagi-smallweb.processFeed',
      'kagi-smallweb.sync',
    ])
  })

  it('routes sync to dispatchKagiSmallWeb (returns disabled by default), with or without a cursor', async () => {
    await expect(run(KAGI_SMALLWEB_SYNC_JOB.name, {})).resolves.toMatchObject({
      disabled: true,
      enqueued: 0,
    })
    await expect(
      run(KAGI_SMALLWEB_SYNC_JOB.name, { cursor: 'https://a.example.com/feed' }),
    ).resolves.toMatchObject({ disabled: true })
  })

  it('routes processFeed to processFeedEntry and creates the topic', async () => {
    const suffix = randomSuffix()
    const hostname = `kagi-worker-${suffix}.example.com`
    const data = {
      feedUrl: `https://${hostname}/feed.xml`,
      name: hostname,
      slug: `kagi-worker-${suffix}-example-com`,
      sourceType: 'web' as const,
    }

    await expect(run(KAGI_SMALLWEB_PROCESS_FEED_JOB.name, data)).resolves.toMatchObject({
      created: true,
    })
  })
})
