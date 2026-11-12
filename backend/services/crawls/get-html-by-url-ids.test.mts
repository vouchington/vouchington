import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { putS3Object } from '@voucha/test-helpers/aws-emulator-s3'
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

describe('getLatestHtmlByUrlIds', () => {
  it('selects recent uploaded snapshots and continues after download failures and missing objects', async () => {
    // Near the real clock: the frozen service time also signs the real S3 reads, and S3 rejects
    // requests signed more than 15 minutes from its own clock.
    const now = Date.now()
    const freshTime = new Date(now - 60_000)
    const previousTime = new Date(now - 2 * 60 * 60 * 1000)
    const staleTime = new Date(now - (CRAWL_HTML_SNAPSHOT_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000)

    const latestUrl = await createUrl('latest')
    const previous = await insertSnapshot(latestUrl, {
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
    const staleCompletion = await insertSnapshot(staleCompletionUrl, {
      completedAt: staleTime,
      hashByte: 7,
      htmlSnapshotUploadedAt: freshTime,
    })
    const staleUploadUrl = await createUrl('stale-upload')
    const staleUpload = await insertSnapshot(staleUploadUrl, {
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
    const failedStatus = await insertSnapshot(failedStatusUrl, {
      completedAt: freshTime,
      hashByte: 9,
      htmlSnapshotUploadedAt: freshTime,
      statusCode: 404,
    })

    const successful = new Map([
      [latest, '<main>newest snapshot</main>'],
      [afterFailure, '<main>download continued</main>'],
      [completionFallback, '<main>completion timestamp fallback</main>'],
    ])
    // Snapshots the query must not select still have objects, so selecting one would surface it.
    const unselected = [previous, staleCompletion, staleUpload, failedStatus]
    await Promise.all([
      ...[...successful].map(([snapshot, html]) => seedSnapshotHtml(snapshot, html)),
      ...unselected.map(snapshot => seedSnapshotHtml(snapshot, '<main>not selected</main>')),
      // A stored object that is not gzip fails its download; `missing` has no object at all.
      putS3Object({ Bucket: S3Buckets.crawls, Key: s3Key(failed), Body: '<main>not gzip</main>' }),
    ])
    const capturedBefore = sentryCaptureExceptionMock.mock.calls.length

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

      const expected = [...successful]
        .toSorted(([left], [right]) => left.urlId.localeCompare(right.urlId))
        .map(([, html]) => html)
      expect(await Promise.all(files.map(file => readFile(file.filePath, 'utf8')))).toEqual(
        expected,
      )
      const captured = sentryCaptureExceptionMock.mock.calls
        .slice(capturedBefore)
        .map(([error]) => error as Error)
      expect(captured).toHaveLength(1)
      expect(captured[0]).toMatchObject({ code: 'Z_DATA_ERROR' })
    } finally {
      await Promise.all(files.map(file => file.cleanup()))
    }
  })

  it('includes snapshots exactly on the retention cutoff for each date predicate', async () => {
    const frozenNow = Date.now()
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
    const htmlBySnapshot = new Map<CrawlSnapshot, string>()

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
      htmlBySnapshot.set(snapshot, `<main>${predicate}:${delta}</main>`)
      if (delta >= 0) expected.push(snapshot)
    }

    await Promise.all(
      [...htmlBySnapshot].map(([snapshot, html]) => seedSnapshotHtml(snapshot, html)),
    )
    let files: Awaited<ReturnType<typeof getLatestHtmlByUrlIds>> = []
    try {
      files = await runWithServiceNow(frozenNow, () =>
        getLatestHtmlByUrlIds(snapshots.map(snapshot => snapshot.urlId)),
      )
      const selected = expected.toSorted((left, right) => left.urlId.localeCompare(right.urlId))
      expect(await Promise.all(files.map(file => readFile(file.filePath, 'utf8')))).toEqual(
        selected.map(snapshot => htmlBySnapshot.get(snapshot)),
      )
    } finally {
      await Promise.all(files.map(file => file.cleanup()))
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

/** Stores a snapshot's HTML where the crawl writer puts it; each URL hostname is test-owned. */
async function seedSnapshotHtml(snapshot: CrawlSnapshot, html: string): Promise<void> {
  await putS3Object({
    Bucket: S3Buckets.crawls,
    Key: s3Key(snapshot),
    Body: gzipSync(Buffer.from(html)),
    ContentEncoding: 'gzip',
  })
}
