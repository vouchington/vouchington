import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => ({
  ...(await importOriginal<typeof import('@modules/aws')>()),
  S3ImagesClient: {
    send: mocks.send,
  } as unknown as typeof import('@modules/aws').S3ImagesClient,
}))

import {
  copySesInboundObjectToCopyrightEvidence,
  deleteSesInboundObject,
  listCopyrightSesInboundObjects,
  listSesInboundObjects,
  loadSesInboundObjectAndHash,
  loadSesInboundObjectVersion,
  loadSesInboundObject,
  MAX_SES_INBOUND_BYTES,
  moveSesInboundObjectToFailed,
} from './s3.mts'

describe('SES inbound S3 storage', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'voucha-ses-inbound-test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('accepts the 40 MiB SES size boundary', async () => {
    mocks.send.mockResolvedValueOnce({
      ContentLength: MAX_SES_INBOUND_BYTES,
      ETag: '"etag-1"',
      Body: Readable.from([Buffer.from('raw MIME')]),
      LastModified: new Date('2026-07-01T12:00:00.000Z'),
    } as never)

    await expect(readStream(await loadSesInboundObject('incoming/message-123'))).resolves.toEqual(
      Buffer.from('raw MIME'),
    )
    const command = mocks.send.mock.calls[0]![0] as GetObjectCommand
    expect(command.input).toEqual({
      Bucket: 'voucha-ses-inbound-test',
      Key: 'incoming/message-123',
    })
  })

  it('rejects an object above the 40 MiB SES size boundary', async () => {
    mocks.send.mockResolvedValueOnce({
      ContentLength: MAX_SES_INBOUND_BYTES + 1,
      ETag: '"etag-1"',
      Body: Readable.from([Buffer.from('raw MIME')]),
      LastModified: new Date('2026-07-01T12:00:00.000Z'),
    } as never)

    await expect(loadSesInboundObject('incoming/message-123')).rejects.toThrow(
      `${MAX_SES_INBOUND_BYTES}-byte limit`,
    )
  })

  it('accepts a streamed object exactly at the limit when S3 omits ContentLength', async () => {
    mocks.send.mockResolvedValueOnce({
      ETag: '"etag-1"',
      Body: generateChunkedBody(MAX_SES_INBOUND_BYTES),
      LastModified: new Date('2026-07-01T12:00:00.000Z'),
    } as never)

    const body = await inspectStream(await loadSesInboundObject('incoming/message-123'))

    expect(body).toEqual({ byteLength: MAX_SES_INBOUND_BYTES, firstByte: 0x61, lastByte: 0x61 })
  })

  it('rejects a streamed object one byte above the limit when S3 omits ContentLength', async () => {
    mocks.send.mockResolvedValueOnce({
      ETag: '"etag-1"',
      Body: generateChunkedBody(MAX_SES_INBOUND_BYTES + 1),
      LastModified: new Date('2026-07-01T12:00:00.000Z'),
    } as never)

    await expect(inspectStream(await loadSesInboundObject('incoming/message-123'))).rejects.toThrow(
      `${MAX_SES_INBOUND_BYTES}-byte limit`,
    )
  })

  it('deletes the completed source object from the configured bucket', async () => {
    mocks.send.mockResolvedValueOnce({} as never)

    await deleteSesInboundObject('incoming/message-123')

    const command = mocks.send.mock.calls[0]![0] as DeleteObjectCommand
    expect(command.input).toEqual({
      Bucket: 'voucha-ses-inbound-test',
      Key: 'incoming/message-123',
    })
  })

  it('copies the exact hashed version into copyright evidence', async () => {
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'voucha-copyright-evidence-test')
    mocks.send.mockResolvedValueOnce({} as never)

    await copySesInboundObjectToCopyrightEvidence(
      'copyright-incoming/message 123',
      'message-123',
      Buffer.alloc(32, 7),
      { eTag: '"etag-1"', versionId: 'version/1' },
    )

    const command = mocks.send.mock.calls[0]![0] as CopyObjectCommand
    expect(command.input).toEqual({
      Bucket: 'voucha-copyright-evidence-test',
      Key: `email/message-123/${Buffer.alloc(32, 7).toString('hex')}.eml`,
      CopySource: 'voucha-ses-inbound-test/copyright-incoming/message%20123?versionId=version%2F1',
      CopySourceIfMatch: '"etag-1"',
      MetadataDirective: 'COPY',
    })
  })

  it('moves terminal source objects to the failed prefix', async () => {
    mocks.send.mockResolvedValue({} as never)

    await moveSesInboundObjectToFailed('incoming/message 123+copy', 'message-123')

    const copyCommand = mocks.send.mock.calls[0]![0] as CopyObjectCommand
    const deleteCommand = mocks.send.mock.calls[1]![0] as DeleteObjectCommand
    expect(copyCommand.input).toEqual({
      Bucket: 'voucha-ses-inbound-test',
      Key: 'failed/message-123',
      CopySource: 'voucha-ses-inbound-test/incoming/message%20123%2Bcopy',
    })
    expect(deleteCommand.input).toEqual({
      Bucket: 'voucha-ses-inbound-test',
      Key: 'incoming/message 123+copy',
    })
  })

  it('lists keyed incoming objects and preserves the continuation token', async () => {
    mocks.send.mockResolvedValueOnce({
      Contents: [{ Key: 'incoming/message-123' }, {}, { Key: '' }],
      NextContinuationToken: 'next-page',
    } as never)

    await expect(listSesInboundObjects('current-page')).resolves.toEqual({
      objectKeys: ['incoming/message-123'],
      nextContinuationToken: 'next-page',
    })
    const command = mocks.send.mock.calls[0]![0] as ListObjectsV2Command
    expect(command.input).toEqual({
      Bucket: 'voucha-ses-inbound-test',
      Prefix: 'incoming/',
      ContinuationToken: 'current-page',
    })
  })

  it('loads the exact S3 version and preserves its received timestamp for hashing', async () => {
    const receivedAt = new Date('2026-07-01T12:00:00.000Z')
    mocks.send.mockResolvedValueOnce({
      ContentLength: 3,
      ETag: '"etag-1"',
      VersionId: 'version-1',
      Body: Readable.from([Buffer.from('raw')]),
      LastModified: receivedAt,
    } as never)

    const loaded = await loadSesInboundObjectAndHash('copyright-incoming/message-123')
    await expect(readStream(loaded.rawMime)).resolves.toEqual(Buffer.from('raw'))
    await expect(loaded.digest).resolves.toEqual({
      sha256: Buffer.from(
        'd7439bee24773bcbfa2d0a97947ee36227b10d1022b1a55847e928965bb6bfde',
        'hex',
      ),
      byteSize: 3,
    })
    expect(loaded.receivedAt).toEqual(receivedAt)
    expect(loaded.sourceIdentity).toEqual({ eTag: '"etag-1"', versionId: 'version-1' })

    mocks.send.mockResolvedValueOnce({
      ContentLength: 3,
      ETag: '"etag-2"',
      Body: Readable.from([Buffer.from('raw')]),
      LastModified: receivedAt,
    } as never)
    await expect(
      readStream(
        await loadSesInboundObjectVersion('copyright-incoming/message-123', { eTag: '"etag-2"' }),
      ),
    ).resolves.toEqual(Buffer.from('raw'))
    const command = mocks.send.mock.calls[1]![0] as GetObjectCommand
    expect(command.input).toMatchObject({ IfMatch: '"etag-2"' })
  })

  it('lists copyright intake objects separately from ordinary inbound mail', async () => {
    mocks.send.mockResolvedValueOnce({
      Contents: [{ Key: 'copyright-incoming/message-123' }],
    } as never)

    await expect(listCopyrightSesInboundObjects()).resolves.toEqual({
      objectKeys: ['copyright-incoming/message-123'],
    })
    const command = mocks.send.mock.calls[0]![0] as ListObjectsV2Command
    expect(command.input).toMatchObject({ Prefix: 'copyright-incoming/' })
  })

  it('rejects missing, non-streaming, and unreadable object bodies', async () => {
    mocks.send.mockResolvedValueOnce({} as never)
    await expect(loadSesInboundObject('incoming/missing')).rejects.toThrow(
      'Raw SES object has no body',
    )

    mocks.send.mockResolvedValueOnce({
      ETag: '"etag-1"',
      Body: {},
      LastModified: new Date('2026-07-01T12:00:00.000Z'),
    } as never)
    await expect(loadSesInboundObject('incoming/non-streaming')).rejects.toThrow(
      'Raw SES object body is not readable',
    )

    mocks.send.mockResolvedValueOnce({
      ETag: '"etag-1"',
      Body: generateUnreadableBody(),
      LastModified: new Date('2026-07-01T12:00:00.000Z'),
    } as never)
    await expect(inspectStream(await loadSesInboundObject('incoming/unreadable'))).rejects.toThrow(
      'Raw SES object contained an unreadable chunk',
    )
  })
})

async function* generateChunkedBody(totalBytes: number): AsyncGenerator<Uint8Array> {
  const reusableChunk = Buffer.alloc(1024 * 1024, 0x61)
  let emittedBytes = 0
  while (emittedBytes < totalBytes) {
    const chunkBytes = Math.min(reusableChunk.byteLength, totalBytes - emittedBytes)
    yield reusableChunk.subarray(0, chunkBytes)
    emittedBytes += chunkBytes
  }
}

async function* generateUnreadableBody(): AsyncGenerator<number> {
  yield 42
}

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function inspectStream(
  stream: Readable,
): Promise<{ byteLength: number; firstByte?: number; lastByte?: number }> {
  let byteLength = 0
  let firstByte: number | undefined
  let lastByte: number | undefined
  for await (const rawChunk of stream) {
    const chunk = Buffer.from(rawChunk)
    if (firstByte === undefined) firstByte = chunk[0]
    lastByte = chunk.at(-1)
    byteLength += chunk.byteLength
  }
  return { byteLength, ...(firstByte === undefined ? {} : { firstByte, lastByte }) }
}
