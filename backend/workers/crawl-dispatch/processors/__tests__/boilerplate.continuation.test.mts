import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { backgroundCpu as crawlDispatchQueue } from '@queues/background-cpu/queues'
import { getLatestBoilerplateRemovalByHostnameAndPath } from '@services/boilerplate-removals'
import { insertTestUrlHostname, insertTestUrl, insertTestCrawl } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { crawlBoilerplateRemovalWorkConfig } from '@queues/crawl-dispatch/config'
import { processBoilerplateRemoval } from '../boilerplate.mts'

describe('boilerplate removal continuation', () => {
  it('does not persist a skipped singleton until the URL walk is exhausted', async () => {
    const hostname = `bp-singleton-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = await insertTestUrl({ hostnameId, url: `https://${hostname}/solo/one` })
    const { id: crawlId } = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: '',
      completedAt: new Date(),
      htmlSha256: Buffer.alloc(32, 1),
      htmlSnapshotUploadedAt: new Date(),
    })
    onTestFinished(
      overrideDynamicConfigFieldsForTest(crawlBoilerplateRemovalWorkConfig, { batch_size: 1 }),
    )
    onTestFinished(async () => {
      const jobs = await crawlDispatchQueue.searchJobs({
        name: 'crawl.boilerplate_removal',
        data: { hostname_id: hostnameId, parent_path: '/solo' },
      })
      await Promise.all(jobs.map(job => job.remove()))
    })
    expect(await processBoilerplateRemoval(hostnameId, '/solo')).toEqual({
      hostname_id: hostnameId,
      parent_path: '/solo',
      skipped: false,
      deferred: true,
    })
    expect(await getLatestBoilerplateRemovalByHostnameAndPath(hostnameId, '/solo')).toBeNull()
    const jobs = await crawlDispatchQueue.searchJobs({
      name: 'crawl.boilerplate_removal',
      data: { hostname_id: hostnameId, parent_path: '/solo', after: urlId },
    })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.data).toMatchObject({
      after: urlId,
      samples: [{ url_id: urlId, crawl_id: crawlId }],
    })
    expect(
      await processBoilerplateRemoval(
        hostnameId,
        '/solo',
        jobs[0]!.data as { after: string; samples: { url_id: string; crawl_id: string }[] },
      ),
    ).toEqual({ hostname_id: hostnameId, parent_path: '/solo', skipped: true })
    expect(await getLatestBoilerplateRemovalByHostnameAndPath(hostnameId, '/solo')).not.toBeNull()
  })
})
