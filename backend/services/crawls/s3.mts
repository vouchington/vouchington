import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, open, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
// Node's own web-streams ReadableStream, not the DOM lib's — this program also loads "dom"
// (playwright, integration-tests), where the ambient global `ReadableStream` resolves to
// lib.dom's type, which `Readable.fromWeb()` (typed against node:stream/web) rejects.
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web'
import { createGzip, createGunzip } from 'node:zlib'
import { S3Buckets, S3ImagesClient } from '@modules/aws'

const MAX_CRAWL_HTML_BYTES = 10 * 1024 * 1024

export type CrawlHtmlTempFile = {
  filePath: string
  byteLength: number
  cleanup: () => Promise<void>
}

function buildS3Key(hostname: string, urlId: string, htmlSha256Hex: string): string {
  return `${hostname}/${urlId}/${htmlSha256Hex}`
}

export async function uploadCrawlHtmlToS3(
  hostname: string,
  urlId: string,
  htmlSha256Hex: string,
  htmlBuffer: Buffer,
): Promise<void> {
  const gzipFile = await createTemporaryGzipFile(htmlBuffer)
  await uploadTemporaryGzipFile(hostname, urlId, htmlSha256Hex, gzipFile)
}

export async function uploadCrawlHtmlFileToS3(
  hostname: string,
  urlId: string,
  htmlSha256Hex: string,
  filePath: string,
): Promise<void> {
  const gzipFile = await createTemporaryGzipFileFromPath(filePath)
  await uploadTemporaryGzipFile(hostname, urlId, htmlSha256Hex, gzipFile)
}

/* no-mistakes: integration=aws */
async function uploadTemporaryGzipFile(
  hostname: string,
  urlId: string,
  htmlSha256Hex: string,
  gzipFile: { filePath: string; byteLength: number; tempDir: string },
): Promise<void> {
  try {
    await using gzipHandle = await open(gzipFile.filePath, 'r')
    await S3ImagesClient.send(
      new PutObjectCommand({
        Bucket: S3Buckets.crawls,
        Key: buildS3Key(hostname, urlId, htmlSha256Hex),
        Body: gzipHandle.createReadStream(),
        ContentLength: gzipFile.byteLength,
        ContentType: 'text/html',
        ContentEncoding: 'gzip',
        StorageClass: 'REDUCED_REDUNDANCY',
      }),
    )
  } finally {
    await rm(gzipFile.tempDir, { recursive: true, force: true })
  }
}

/* no-mistakes: integration=aws */
export async function downloadCrawlHtmlToTempFile(
  hostname: string,
  urlId: string,
  htmlSha256Hex: string,
  maxBytes: number = MAX_CRAWL_HTML_BYTES,
): Promise<CrawlHtmlTempFile | null> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-html-download-'))
  const filePath = path.join(tempDir, 'crawl.html')

  try {
    const result = await S3ImagesClient.send(
      new GetObjectCommand({
        Bucket: S3Buckets.crawls,
        Key: buildS3Key(hostname, urlId, htmlSha256Hex),
      }),
    )
    if (!result.Body) {
      await rm(tempDir, { recursive: true, force: true })
      return null
    }

    let byteLength = 0
    await pipeline(
      createReadableFromS3Body(result.Body),
      createGunzip(),
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          byteLength += chunk.length
          if (byteLength > maxBytes) {
            callback(new Error(`Crawl HTML from S3 exceeds ${maxBytes} bytes`))
            return
          }
          callback(null, chunk)
        },
      }),
      createWriteStream(filePath, { mode: 0o600 }),
    )

    let cleanedUp = false
    return {
      filePath,
      byteLength,
      cleanup: async () => {
        if (cleanedUp) return
        await rm(tempDir, { recursive: true, force: true })
        cleanedUp = true
      },
    }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true })
    if (error instanceof Error && error.name === 'NoSuchKey') return null
    throw error
  }
}

function createReadableFromS3Body(body: unknown): Readable {
  if (body instanceof Readable) return body
  if (isWebReadableStream(body)) return Readable.fromWeb(body)
  if (isAsyncIterable(body)) return Readable.from(body)
  throw new Error('S3 crawl HTML body is not readable')
}

function isWebReadableStream(body: unknown): body is NodeWebReadableStream<Uint8Array> {
  return typeof (body as NodeWebReadableStream<Uint8Array> | null)?.getReader === 'function'
}

function isAsyncIterable(body: unknown): body is AsyncIterable<Uint8Array> {
  return typeof (body as AsyncIterable<Uint8Array> | null)?.[Symbol.asyncIterator] === 'function'
}

async function createTemporaryGzipFile(
  htmlBuffer: Buffer,
): Promise<{ filePath: string; byteLength: number; tempDir: string }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-html-'))
  const filePath = path.join(tempDir, 'crawl.html.gz')

  try {
    await pipeline(Readable.from([htmlBuffer]), createGzip(), createWriteStream(filePath))
    const fileStats = await stat(filePath)
    return { filePath, byteLength: fileStats.size, tempDir }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true })
    throw error
  }
}

async function createTemporaryGzipFileFromPath(
  sourcePath: string,
): Promise<{ filePath: string; byteLength: number; tempDir: string }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-html-'))
  const filePath = path.join(tempDir, 'crawl.html.gz')
  try {
    await pipeline(createReadStream(sourcePath), createGzip(), createWriteStream(filePath))
    const fileStats = await stat(filePath)
    return { filePath, byteLength: fileStats.size, tempDir }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true })
    throw error
  }
}
