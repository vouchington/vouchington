import { createHash, randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { describe, expect, it, onTestFinished } from 'vitest'
import { backgroundCpu as crawlDispatchQueue } from '@queues/background-cpu/queues'
import { getLatestBoilerplateRemovalByHostnameAndPath } from '@services/boilerplate-removals'
import { insertTestUrlHostname, insertTestUrl, insertTestCrawl } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { crawlBoilerplateRemovalWorkConfig } from '@queues/crawl-dispatch/config'
import { processBoilerplateRemoval } from '../boilerplate.mts'
import { S3Buckets } from '@modules/aws'
import { putS3Object, deleteS3Object } from '@voucha/test-helpers/aws-emulator-s3'
import type { BackgroundCpuJobPayloads } from '@queues/background-cpu/types'

describe('boilerplate removal continuation', () => {
  it('retains usable snapshots when an incomplete HTML sample must continue', async () => {
    const hostname = `bp-html-continuation-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const now = new Date()
    const bodies = [
      Buffer.from(
        '<html><body><header>Shared navigation</header><main>First article</main></body></html>',
      ),
      Buffer.from([0xc3, 0x28]),
      undefined,
      Buffer.from(
        '<html><body><header>Shared navigation</header><main>Later article</main></body></html>',
      ),
    ]
    const samples: { url_id: string; crawl_id: string }[] = []
    const objectKeys: string[] = []
    onTestFinished(async () => {
      const jobs = await crawlDispatchQueue.searchJobs({
        name: 'crawl.boilerplate_removal',
        data: { hostname_id: hostnameId, parent_path: '/blog' },
      })
      await Promise.all([
        ...jobs.map(job => job.remove()),
        ...objectKeys.map(key => deleteS3Object(S3Buckets.crawls, key)),
      ])
    })
    for (const [index, body] of bodies.entries()) {
      const urlId = await insertTestUrl({ hostnameId, url: `https://${hostname}/blog/${index}` })
      const hash = createHash('sha256')
        .update(body ?? 'missing snapshot')
        .digest()
      const { id: crawlId } = await insertTestCrawl({
        urlId,
        statusCode: 200,
        markdown: '',
        completedAt: now,
        htmlSha256: hash,
        htmlSnapshotUploadedAt: now,
      })
      samples.push({ url_id: urlId, crawl_id: crawlId })
      if (body) {
        const key = `${hostname}/${urlId}/${hash.toString('hex')}`
        objectKeys.push(key)
        await putS3Object({
          Bucket: S3Buckets.crawls,
          Key: key,
          Body: gzipSync(body),
          ContentEncoding: 'gzip',
        })
      }
    }
    onTestFinished(
      overrideDynamicConfigFieldsForTest(crawlBoilerplateRemovalWorkConfig, { batch_size: 8 }),
    )
    expect(await processBoilerplateRemoval(hostnameId, '/blog')).toEqual({
      hostname_id: hostnameId,
      parent_path: '/blog',
      skipped: false,
      deferred: true,
    })
    expect(await getLatestBoilerplateRemovalByHostnameAndPath(hostnameId, '/blog')).toBeNull()
    const jobs = await crawlDispatchQueue.searchJobs({
      name: 'crawl.boilerplate_removal',
      data: { hostname_id: hostnameId, parent_path: '/blog' },
    })
    expect(jobs).toHaveLength(1)
    const continuation = jobs[0]!.data as BackgroundCpuJobPayloads['crawl.boilerplate_removal']
    expect(continuation.after).toBe(samples[2]!.url_id)
    expect(continuation.samples).toEqual([samples[0]])
    expect(await processBoilerplateRemoval(hostnameId, '/blog', continuation)).toEqual({
      hostname_id: hostnameId,
      parent_path: '/blog',
      skipped: false,
    })
    expect(await getLatestBoilerplateRemovalByHostnameAndPath(hostnameId, '/blog')).not.toBeNull()
  })

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
    expect(jobs[0]!.data).toMatchObject({ after: urlId, crawl_probe_id: crawlId, samples: [] })
    expect(
      await processBoilerplateRemoval(
        hostnameId,
        '/solo',
        jobs[0]!.data as { after: string; crawl_probe_id: string },
      ),
    ).toEqual({ hostname_id: hostnameId, parent_path: '/solo', skipped: false, deferred: true })
    expect(await getLatestBoilerplateRemovalByHostnameAndPath(hostnameId, '/solo')).toBeNull()
    expect(
      await processBoilerplateRemoval(hostnameId, '/solo', {
        after: urlId,
        samples: [{ url_id: urlId, crawl_id: crawlId }],
      }),
    ).toEqual({ hostname_id: hostnameId, parent_path: '/solo', skipped: true })
    expect(await getLatestBoilerplateRemovalByHostnameAndPath(hostnameId, '/solo')).not.toBeNull()
  })
})
