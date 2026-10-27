import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from '@aws-sdk/client-s3'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import {
  hardDeleteTestUrl,
  insertTestUrlDirect,
  type TestViewUrl,
} from '../../test-helpers/entities/urls.mts'
import { insertTestCrawl } from '../../test-helpers/entities/crawls.mts'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from './constants.mts'
import { getLatestHtmlByUrlIds } from './get-html-by-url-ids.mts'

type CrawlSnapshot = {
  hash: string
  hostname: string
  urlId: string
}

type SnapshotOptions = {
  completedAt: Date
  hashByte?: number
  htmlSnapshotUploadedAt?: Date
  statusCode?: number
}

type S3Response = { html: string } | { error: Error }

describe('getLatestHtmlByUrlIds', () => {
  it('selects recent uploaded snapshots and continues after download failures and missing objects', async () => {
    const now = Date.now() + 14 * 24 * 60 * 60 * 1000
    const freshTime = new Date(now - 60_000)
    const previousTime = new Date(now - 2 * 60 * 60 * 1000)
    const staleTime = new Date(now - (CRAWL_HTML_SNAPSHOT_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000)

    const latestUrl = await createUrl('latest')
    await insertSnapshot(latestUrl, {
      completedAt: previousTime,
      hashByte: 1,
      htmlSnapshotUploadedAt: previousTime,
    })
    const latest = await insertSnapshot(latestUrl, {
      completedAt: freshTime,
      hashByte: 2,
      htmlSnapshotUploadedAt: freshTime,
    })

    const failed = await insertSnapshot(await createUrl('failed'), {
      completedAt: freshTime,
      hashByte: 3,
      htmlSnapshotUploadedAt: freshTime,
    })
    const afterFailure = await insertSnapshot(await createUrl('after-failure'), {
      completedAt: freshTime,
      hashByte: 4,
      htmlSnapshotUploadedAt: freshTime,
    })
    const missing = await insertSnapshot(await createUrl('missing-object'), {
      completedAt: freshTime,
      hashByte: 5,
      htmlSnapshotUploadedAt: freshTime,
    })
    const completionFallback = await insertSnapshot(await createUrl('completion-fallback'), {
      completedAt: freshTime,
      hashByte: 6,
    })
    const staleCompletionUrl = await createUrl('stale-completion')
    await insertSnapshot(staleCompletionUrl, {
      completedAt: staleTime,
      hashByte: 7,
      htmlSnapshotUploadedAt: freshTime,
    })
    const staleUploadUrl = await createUrl('stale-upload')
    await insertSnapshot(staleUploadUrl, {
      completedAt: freshTime,
      hashByte: 8,
      htmlSnapshotUploadedAt: staleTime,
    })
    const missingHashUrl = await createUrl('missing-hash')
    await insertTestCrawl({
      urlId: missingHashUrl.id,
      statusCode: 200,
      markdown: '',
      completedAt: freshTime,
    })
    const failedStatusUrl = await createUrl('failed-status')
    await insertSnapshot(failedStatusUrl, {
      completedAt: freshTime,
      hashByte: 9,
      htmlSnapshotUploadedAt: freshTime,
      statusCode: 404,
    })

    const downloadError = new Error('Owned S3 download failed')
    const missingObjectError = new Error('Crawl HTML snapshot no longer exists')
    missingObjectError.name = 'NoSuchKey'
    const snapshots = [latest, failed, afterFailure, missing, completionFallback]
    const ownedUrlIds = new Set([
      latest.urlId,
      failed.urlId,
      afterFailure.urlId,
      missing.urlId,
      completionFallback.urlId,
      staleCompletionUrl.id,
      staleUploadUrl.id,
      missingHashUrl.id,
      failedStatusUrl.id,
    ])
    const responses = new Map<string, S3Response>([
      [s3Key(latest), { html: '<main>newest snapshot</main>' }],
      [s3Key(failed), { error: downloadError }],
      [s3Key(afterFailure), { html: '<main>download continued</main>' }],
      [s3Key(missing), { error: missingObjectError }],
      [s3Key(completionFallback), { html: '<main>completion timestamp fallback</main>' }],
    ])
    const downloads = stubOwnedCrawlS3Responses(ownedUrlIds, responses)

    let files: Awaited<ReturnType<typeof getLatestHtmlByUrlIds>> = []
    try {
      files = await runWithServiceNow(now, () =>
        getLatestHtmlByUrlIds([
          latest.urlId,
          failed.urlId,
          afterFailure.urlId,
          missing.urlId,
          completionFallback.urlId,
          staleCompletionUrl.id,
          staleUploadUrl.id,
          missingHashUrl.id,
          failedStatusUrl.id,
        ]),
      )

      const requested = snapshots.toSorted((left, right) => left.urlId.localeCompare(right.urlId))
      const successful = [latest, afterFailure, completionFallback].toSorted((left, right) =>
        left.urlId.localeCompare(right.urlId),
      )
      expect(downloads.requests).toEqual(
        requested.map(snapshot => ({ bucket: S3Buckets.crawls, key: s3Key(snapshot) })),
      )
      expect(await Promise.all(files.map(file => readFile(file.filePath, 'utf8')))).toEqual(
        successful.map(snapshot => {
          const response = responses.get(s3Key(snapshot))
          if (!response || !('html' in response)) throw new Error('Expected successful S3 fixture')
          return response.html
        }),
      )
      expect(
        sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === downloadError),
      ).toHaveLength(1)
      expect(
        sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === missingObjectError),
      ).toHaveLength(0)
    } finally {
      try {
        await Promise.all(files.map(file => file.cleanup()))
      } finally {
        downloads.restore()
      }
    }
  })

  it('includes snapshots exactly on the retention cutoff for each date predicate', async () => {
    const frozenNow = Date.now() + 30 * 24 * 60 * 60 * 1000
    const cutoff = frozenNow - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    const freshTime = new Date(frozenNow - 60_000)
    const boundaries = [
      { predicate: 'completion', delta: -1 },
      { predicate: 'completion', delta: 0 },
      { predicate: 'completion', delta: 1 },
      { predicate: 'upload', delta: -1 },
      { predicate: 'upload', delta: 0 },
      { predicate: 'upload', delta: 1 },
      { predicate: 'fallback', delta: -1 },
      { predicate: 'fallback', delta: 0 },
      { predicate: 'fallback', delta: 1 },
    ] as const
    const snapshots: CrawlSnapshot[] = []
    const expected: CrawlSnapshot[] = []
    const htmlResponses = new Map<string, { html: string }>()

    for (const [index, { predicate, delta }] of boundaries.entries()) {
      const url = await createUrl(`cutoff-${predicate}-${delta}`)
      const boundaryTime = new Date(cutoff + delta)
      const snapshot = await insertSnapshot(url, {
        completedAt: predicate === 'upload' ? freshTime : boundaryTime,
        hashByte: index + 10,
        ...(predicate === 'fallback'
          ? {}
          : {
              htmlSnapshotUploadedAt: predicate === 'completion' ? freshTime : boundaryTime,
            }),
      })
      snapshots.push(snapshot)
      htmlResponses.set(s3Key(snapshot), { html: `<main>${predicate}:${delta}</main>` })
      if (delta >= 0) expected.push(snapshot)
    }

    const downloads = stubOwnedCrawlS3Responses(
      new Set(snapshots.map(snapshot => snapshot.urlId)),
      htmlResponses,
    )
    let files: Awaited<ReturnType<typeof getLatestHtmlByUrlIds>> = []
    try {
      files = await runWithServiceNow(frozenNow, () =>
        getLatestHtmlByUrlIds(snapshots.map(snapshot => snapshot.urlId)),
      )
      const selected = expected.toSorted((left, right) => left.urlId.localeCompare(right.urlId))
      expect(downloads.requests).toEqual(
        selected.map(snapshot => ({ bucket: S3Buckets.crawls, key: s3Key(snapshot) })),
      )
      expect(await Promise.all(files.map(file => readFile(file.filePath, 'utf8')))).toEqual(
        selected.map(snapshot => htmlResponses.get(s3Key(snapshot))?.html),
      )
    } finally {
      try {
        await Promise.all(files.map(file => file.cleanup()))
      } finally {
        downloads.restore()
      }
    }
  })
})

async function createUrl(path: string): Promise<TestViewUrl> {
  const url = await insertTestUrlDirect(
    null,
    `https://crawl-html-${randomUUID()}.example.com/${path}`,
  )
  if (!url) throw new Error('Expected a public test URL')
  onTestFinished(() => hardDeleteTestUrl(url.id))
  return url
}

async function insertSnapshot(url: TestViewUrl, options: SnapshotOptions): Promise<CrawlSnapshot> {
  const hash = Buffer.alloc(32, options.hashByte ?? 1)
  await insertTestCrawl({
    urlId: url.id,
    statusCode: options.statusCode ?? 200,
    markdown: '',
    completedAt: options.completedAt,
    htmlSha256: hash,
    ...(options.htmlSnapshotUploadedAt
      ? { htmlSnapshotUploadedAt: options.htmlSnapshotUploadedAt }
      : {}),
  })
  return { hash: hash.toString('hex'), hostname: url.hostname.hostname, urlId: url.id }
}

function s3Key(snapshot: CrawlSnapshot): string {
  return `${snapshot.hostname}/${snapshot.urlId}/${snapshot.hash}`
}

async function runWithServiceNow<T>(now: number, operation: () => Promise<T>): Promise<T> {
  const clock = new AsyncLocalStorage<number>()
  const originalNow = Date.now
  // oxlint-disable vitest/prefer-mock-return-shorthand -- Return frozen time only in this AsyncLocalStorage scope; delegate unrelated calls.
  const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => clock.getStore() ?? originalNow())
  // oxlint-enable vitest/prefer-mock-return-shorthand
  try {
    return await clock.run(now, operation)
  } finally {
    dateNow.mockRestore()
  }
}

function stubOwnedCrawlS3Responses(
  ownedUrlIds: ReadonlySet<string>,
  responses: ReadonlyMap<string, S3Response>,
) {
  const requests: Array<{ bucket: string | undefined; key: string | undefined }> = []
  const previousSend = S3Client.prototype.send
  const send = vi.spyOn(S3Client.prototype, 'send')
  send.mockImplementation(async function (this: S3Client, command, ...args) {
    const delegate = () => Reflect.apply(previousSend, this, [command, ...args])
    if (!(command instanceof GetObjectCommand)) return delegate()
    const { Bucket, Key } = command.input
    const urlId = Key?.split('/')[1]
    if (!urlId || !ownedUrlIds.has(urlId)) return delegate()
    requests.push({ bucket: Bucket, key: Key })
    if (Bucket !== S3Buckets.crawls || !Key) return delegate()
    const response = responses.get(Key)
    if (!response) return delegate()
    if ('error' in response) throw response.error
    const output: GetObjectCommandOutput = {
      $metadata: { httpStatusCode: 200 },
      Body: Readable.from([gzipSync(Buffer.from(response.html))]) as GetObjectCommandOutput['Body'],
    }
    return output
  })
  return { requests, restore: () => send.mockRestore() }
}
