import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { hackerNewsQueue } from '@queues/hacker-news/queues'
import { hackerNewsQueueConfig } from '@queues/hacker-news/config'
import { insertTestUrlDirect } from '@voucha/test-helpers/entities/urls'
import { observeTestPostgresQueryPools } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processUrlCreated } from './urls.mts'

describe('URL-created listener', () => {
  it('admits a newly committed URL through the primary before its ordinary URL read', async () => {
    await hackerNewsQueueConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsQueueConfig, { lookups_enabled: true }),
    )
    const url = await insertTestUrlDirect(
      null,
      `https://url-created-${randomUUID()}.example.com/article`,
    )
    if (!url) throw new Error('Expected a committed URL fixture')
    const jobId = `hacker-news__${url.id}`
    onTestFinished(async () => {
      await (await hackerNewsQueue.getJob(jobId))?.remove()
    })

    const observation = await observeTestPostgresQueryPools(
      '/* getHackerNewsLookupTargets */',
      () => processUrlCreated({ id: url.id }),
    )

    expect(observation.pools).toEqual(['write'])
    expect((await hackerNewsQueue.getJob(jobId))?.data).toEqual({ urlId: url.id })
  })
})
