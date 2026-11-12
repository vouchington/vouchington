import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { UnrecoverableError, Worker } from 'glide-mq'
import { listS3Keys, putS3Object, s3ObjectExists } from '@voucha/test-helpers/aws-emulator-s3'
import { denyS3ObjectActions } from '@voucha/test-helpers/s3-owned-bucket'
import {
  failNextS3ImagesClientCommandForTest,
  mutateS3ImagesClientResponseForTest,
} from '@voucha/test-helpers/s3-images-client-injection'
import {
  readS3ObjectLastModifiedForTest,
  useSesInboundBucket,
} from '@voucha/test-helpers/ses-inbound-s3'
import { loadSesInboundObjectAndHash, moveSesInboundObjectToFailed } from './s3.mts'

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

async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

/** Stores the raw message under a key only this test knows. */
async function storeRawMime(bucket: string) {
  const objectKey = `copyright-incoming/${randomUUID()}`
  const { versionId } = await putS3Object({ Bucket: bucket, Key: objectKey, Body: RAW_MIME })
  return { objectKey, versionId }
}

describe('loadSesInboundObjectAndHash', () => {
  const inbound = useSesInboundBucket()

  it('streams the original message once and reports its digest, size, and SES verdicts', async () => {
    const { objectKey, versionId } = await storeRawMime(inbound.name())

    const loaded = await loadSesInboundObjectAndHash(objectKey)
    const streamed = await drain(loaded.rawMime)

    expect(streamed.toString()).toBe(RAW_MIME)
    await expect(loaded.digest).resolves.toEqual({
      sha256: createHash('sha256').update(RAW_MIME).digest(),
      byteSize: Buffer.byteLength(RAW_MIME),
      sesVerdicts: { spf: 'pass', dkim: 'fail', dmarc: 'pass', spam: 'pass', virus: 'fail' },
    })
    expect(loaded.receivedAt).toEqual(
      await readS3ObjectLastModifiedForTest(inbound.name(), objectKey),
    )
    expect(loaded.sourceIdentity).toEqual({ eTag: expect.stringMatching(/^"/), versionId })
  })

  it('defers a throttled S3 read for the SDK response Retry-After', async () => {
    const { objectKey } = await storeRawMime(inbound.name())
    const error = Object.assign(new Error('SlowDown'), {
      $metadata: { httpStatusCode: 429 },
      $response: { headers: { 'retry-after': '17' } },
    })
    // The emulator never throttles, so a 429 with Retry-After is injected.
    failNextS3ImagesClientCommandForTest('GetObjectCommand', error)

    const request = loadSesInboundObjectAndHash(objectKey)
    await expect(request).rejects.toBeInstanceOf(Worker.RateLimitError)
    await expect(request).rejects.toMatchObject({ delayMs: 17_000, cause: error })
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
    Object.assign(new Error('S3 request throttled'), {
      name: 'Throttling',
      $fault: 'client',
      $retryable: { throttling: true },
      $metadata: { httpStatusCode: 400 },
      $response: { headers: { 'retry-after': '17' } },
    }),
  ])('preserves Smithy retryable S3 client errors after SDK retries: $name', async error => {
    const { objectKey } = await storeRawMime(inbound.name())
    // The emulator cannot produce a retryable 400, so the exhausted-retries error is injected.
    failNextS3ImagesClientCommandForTest('GetObjectCommand', error)

    await expect(loadSesInboundObjectAndHash(objectKey)).rejects.toBe(error)
  })

  it('still makes a permanent S3 client error unrecoverable', async () => {
    const { objectKey } = await storeRawMime(inbound.name())
    await denyS3ObjectActions(inbound.name(), [{ action: 's3:GetObject', keys: [objectKey] }])

    await expect(loadSesInboundObjectAndHash(objectKey)).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it('releases the unread body of an object whose declared size exceeds the limit', async () => {
    const { objectKey } = await storeRawMime(inbound.name())
    let body: Readable | undefined
    // Storing 40 MiB to cross the limit would be slow, so only the declared size is changed.
    mutateS3ImagesClientResponseForTest('GetObjectCommand', output => {
      body = output.Body as Readable
      output.ContentLength = 40 * 1024 * 1024 + 1
    })

    await expect(loadSesInboundObjectAndHash(objectKey)).rejects.toThrow(
      'exceeds the 41943040-byte limit',
    )
    expect(body?.destroyed).toBe(true)
  })

  it('rejects the digest when the object stream fails part-way through', async () => {
    const { objectKey } = await storeRawMime(inbound.name())
    // The emulator cannot reset a connection mid-body, so the real body is swapped for one that does.
    mutateS3ImagesClientResponseForTest('GetObjectCommand', output => {
      ;(output.Body as Readable).destroy()
      output.Body = (async function* failing() {
        yield Buffer.from(RAW_MIME.slice(0, 20))
        throw new Error('connection reset')
      })()
    })

    const loaded = await loadSesInboundObjectAndHash(objectKey)
    await Promise.all([
      expect(loaded.digest).rejects.toThrow('connection reset'),
      expect(drain(loaded.rawMime)).rejects.toThrow('connection reset'),
    ])
  })
})

describe('moveSesInboundObjectToFailed', () => {
  const inbound = useSesInboundBucket()

  it('copies the message under the failed prefix and removes the original', async () => {
    const { objectKey } = await storeRawMime(inbound.name())

    await moveSesInboundObjectToFailed(objectKey, 'message-123')

    expect(await s3ObjectExists(inbound.name(), objectKey)).toBe(false)
    expect(await listS3Keys(inbound.name(), 'failed/')).toEqual(['failed/message-123'])
  })

  it('defers a failed-object move when deletion is throttled after the copy', async () => {
    const { objectKey } = await storeRawMime(inbound.name())
    const error = Object.assign(new Error('SlowDown'), {
      $metadata: { httpStatusCode: 429 },
      $response: { headers: { 'retry-after': '11' } },
    })
    // The copy is real; only the delete is throttled, which the emulator cannot do.
    failNextS3ImagesClientCommandForTest('DeleteObjectCommand', error)

    const move = moveSesInboundObjectToFailed(objectKey, 'message-123')
    await expect(move).rejects.toBeInstanceOf(Worker.RateLimitError)
    await expect(move).rejects.toMatchObject({ delayMs: 11_000, cause: error })
    expect(await listS3Keys(inbound.name(), 'failed/')).toEqual(['failed/message-123'])
    expect(await s3ObjectExists(inbound.name(), objectKey)).toBe(true)
  })
})
