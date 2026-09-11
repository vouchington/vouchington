import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { S3ImagesClient } from '@modules/aws'
import { Readable, Transform } from 'node:stream'
import {
  SES_INBOUND_FAILED_PREFIX,
  SES_INBOUND_INCOMING_PREFIX,
} from '@ts-shared/ses-inbound-contract'
import { SesInboundTerminalError } from './mime.mts'

export const MAX_SES_INBOUND_BYTES = 40 * 1024 * 1024

export type SesInboundObjectPage = {
  objectKeys: string[]
  nextContinuationToken?: string
}

/* no-mistakes: integration=aws */
export async function loadSesInboundObject(objectKey: string): Promise<Readable> {
  const response = await S3ImagesClient.send(
    new GetObjectCommand({ Bucket: getSesInboundBucket(), Key: objectKey }),
  )
  rejectOversizedRawEmail(response.ContentLength)
  if (!response.Body) throw new SesInboundTerminalError('Raw SES object has no body')
  return boundedBodyStream(response.Body)
}

/* no-mistakes: integration=aws */
export async function deleteSesInboundObject(objectKey: string): Promise<void> {
  await S3ImagesClient.send(
    new DeleteObjectCommand({ Bucket: getSesInboundBucket(), Key: objectKey }),
  )
}

/* no-mistakes: integration=aws */
export async function moveSesInboundObjectToFailed(
  objectKey: string,
  sesMessageId: string,
): Promise<void> {
  const bucket = getSesInboundBucket()
  await S3ImagesClient.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: `${SES_INBOUND_FAILED_PREFIX}${sesMessageId}`,
      CopySource: `${bucket}/${encodeURIComponent(objectKey).replaceAll('%2F', '/')}`,
    }),
  )
  await S3ImagesClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }))
}

/* no-mistakes: integration=aws */
export async function listSesInboundObjects(
  continuationToken?: string,
): Promise<SesInboundObjectPage> {
  const page = await S3ImagesClient.send(
    new ListObjectsV2Command({
      Bucket: getSesInboundBucket(),
      Prefix: SES_INBOUND_INCOMING_PREFIX,
      ContinuationToken: continuationToken,
    }),
  )
  return {
    objectKeys: (page.Contents ?? []).flatMap(object => (object.Key ? [object.Key] : [])),
    ...(page.NextContinuationToken ? { nextContinuationToken: page.NextContinuationToken } : {}),
  }
}

function getSesInboundBucket(): string {
  const bucket = process.env.S3_BUCKET_SES_INBOUND?.trim()
  if (!bucket) throw new Error('S3_BUCKET_SES_INBOUND is required')
  return bucket
}

function boundedBodyStream(body: unknown): Readable {
  if (!isAsyncIterable(body)) {
    throw new SesInboundTerminalError('Raw SES object body is not readable')
  }

  const source = Readable.from(normalizeBodyChunks(body))
  let bytes = 0
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        bytes += chunk.byteLength
        rejectOversizedRawEmail(bytes)
        callback(null, chunk)
      } catch (error) {
        source.destroy(error as Error)
        callback(error as Error)
      }
    },
  })
  source.once('error', error => counter.destroy(error))
  counter.once('close', () => source.destroy())
  source.pipe(counter)
  return counter
}

async function* normalizeBodyChunks(body: AsyncIterable<unknown>): AsyncGenerator<Uint8Array> {
  for await (const chunk of body) yield toBytes(chunk)
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof (value as AsyncIterable<unknown> | null)?.[Symbol.asyncIterator] === 'function'
}

function toBytes(chunk: unknown): Uint8Array {
  if (typeof chunk === 'string') return Buffer.from(chunk)
  if (chunk instanceof Uint8Array) return chunk
  throw new SesInboundTerminalError('Raw SES object contained an unreadable chunk')
}

function rejectOversizedRawEmail(bytes: number | undefined): void {
  if (bytes !== undefined && bytes > MAX_SES_INBOUND_BYTES) {
    throw new SesInboundTerminalError(
      `Raw SES object exceeds the ${MAX_SES_INBOUND_BYTES}-byte limit`,
    )
  }
}
