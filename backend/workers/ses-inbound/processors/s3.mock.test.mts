import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnrecoverableError, Worker } from 'glide-mq'
import { CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { loadSesInboundObjectAndHash, moveSesInboundObjectToFailed } from './s3.mts'

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => ({
  ...(await importOriginal<typeof import('@modules/aws')>()),
  S3ImagesClient: {
    send: vi.fn<VitestLooseMock>(),
  } as unknown as typeof import('@modules/aws').S3ImagesClient,
}))

import { S3ImagesClient } from '@modules/aws'

const RAW_MIME = [
  'Return-Path: <sender@example.org>',
  'X-SES-Spam-Verdict: PASS',
  'X-SES-Virus-Verdict: FAIL',
  'Authentication-Results: amazonses.com; spf=pass; dkim=fail; dmarc=pass;',
  'X-SES-RECEIPT: AEFBQUFBQUFBQUFH',
  'From: Sender <sender@example.org>',
  '',
  'Body',
].join('\r\n')

const receivedAt = new Date('2026-10-01T10:00:00Z')

function mockObject(body: AsyncIterable<unknown>) {
  vi.mocked(S3ImagesClient.send).mockResolvedValueOnce({
    Body: body,
    ContentLength: RAW_MIME.length,
    LastModified: receivedAt,
    ETag: '"etag-1"',
    VersionId: 'version-1',
  } as never)
}

async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

describe('loadSesInboundObjectAndHash', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'ses-inbound-bucket')
  })

  it('streams the original message once and reports its digest, size, and SES verdicts', async () => {
    mockObject(Readable.from([Buffer.from(RAW_MIME)]))

    const loaded = await loadSesInboundObjectAndHash('copyright-incoming/abc')
    const streamed = await drain(loaded.rawMime)

    expect(streamed.toString()).toBe(RAW_MIME)
    await expect(loaded.digest).resolves.toEqual({
      sha256: createHash('sha256').update(RAW_MIME).digest(),
      byteSize: Buffer.byteLength(RAW_MIME),
      sesVerdicts: { spf: 'pass', dkim: 'fail', dmarc: 'pass', spam: 'pass', virus: 'fail' },
    })
    expect(loaded.receivedAt).toBe(receivedAt)
    expect(loaded.sourceIdentity).toEqual({ eTag: '"etag-1"', versionId: 'version-1' })
  })

  it('defers a throttled S3 read for the SDK response Retry-After', async () => {
    const error = Object.assign(new Error('SlowDown'), {
      $metadata: { httpStatusCode: 429 },
      $response: { headers: { 'retry-after': '17' } },
    })
    vi.mocked(S3ImagesClient.send).mockRejectedValueOnce(error)

    const request = loadSesInboundObjectAndHash('copyright-incoming/abc')
    await expect(request).rejects.toBeInstanceOf(Worker.RateLimitError)
    await expect(request).rejects.toMatchObject({
      delayMs: 17_000,
      cause: error,
    })
  })

  it.each([
    Object.assign(new Error('Request timeout'), {
      name: 'RequestTimeout',
      $fault: 'client',
      $metadata: { httpStatusCode: 400 },
    }),
    Object.assign(new Error('Retryable S3 failure'), {
      name: 'S3TransientError',
      $fault: 'client',
      $retryable: {},
      $metadata: { httpStatusCode: 400 },
    }),
  ])('preserves Smithy retryable S3 client errors after SDK retries: $name', async error => {
    vi.mocked(S3ImagesClient.send).mockRejectedValueOnce(error)

    await expect(loadSesInboundObjectAndHash('copyright-incoming/abc')).rejects.toBe(error)
  })

  it('routes a throttling 400 with Retry-After through the queue HTTP classifier', async () => {
    const error = Object.assign(new Error('S3 request throttled'), {
      name: 'Throttling',
      $fault: 'client',
      $retryable: { throttling: true },
      $metadata: { httpStatusCode: 400 },
      $response: { headers: { 'retry-after': '17' } },
    })
    vi.mocked(S3ImagesClient.send).mockRejectedValueOnce(error)

    await expect(loadSesInboundObjectAndHash('copyright-incoming/abc')).rejects.toBe(error)
  })

  it('still makes a permanent S3 client error unrecoverable', async () => {
    const error = Object.assign(new Error('Access denied'), {
      name: 'AccessDenied',
      $fault: 'client',
      $metadata: { httpStatusCode: 400 },
    })
    vi.mocked(S3ImagesClient.send).mockRejectedValueOnce(error)

    await expect(loadSesInboundObjectAndHash('copyright-incoming/abc')).rejects.toBeInstanceOf(
      UnrecoverableError,
    )
  })

  it('defers a failed-object move when deletion is throttled after the copy', async () => {
    const error = Object.assign(new Error('SlowDown'), {
      $metadata: { httpStatusCode: 429 },
      $response: { headers: { 'retry-after': '11' } },
    })
    vi.mocked(S3ImagesClient.send)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(error)

    const move = moveSesInboundObjectToFailed('copyright-incoming/abc', 'message-123')
    await expect(move).rejects.toBeInstanceOf(Worker.RateLimitError)
    await expect(move).rejects.toMatchObject({ delayMs: 11_000, cause: error })
    expect(vi.mocked(S3ImagesClient.send).mock.calls[0]?.[0]).toBeInstanceOf(CopyObjectCommand)
    expect(vi.mocked(S3ImagesClient.send).mock.calls[1]?.[0]).toBeInstanceOf(DeleteObjectCommand)
  })

  it('rejects the digest when the object stream fails part-way through', async () => {
    async function* failing() {
      yield Buffer.from(RAW_MIME.slice(0, 20))
      throw new Error('connection reset')
    }
    mockObject(failing())

    const loaded = await loadSesInboundObjectAndHash('copyright-incoming/abc')
    await Promise.all([
      expect(loaded.digest).rejects.toThrow('connection reset'),
      expect(drain(loaded.rawMime)).rejects.toThrow('connection reset'),
    ])
  })
})
