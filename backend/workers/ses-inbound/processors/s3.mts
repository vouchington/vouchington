import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { S3ImagesClient } from '@modules/aws'
import { Readable, Transform } from 'node:stream'
import { createHash } from 'node:crypto'
import {
  SES_INBOUND_FAILED_PREFIX,
  SES_INBOUND_COPYRIGHT_PREFIX,
  SES_INBOUND_INCOMING_PREFIX,
} from '@ts-shared/ses-inbound-contract'
import { SesInboundTerminalError } from './mime.mts'
import { boundedBodyStream, rejectOversizedRawEmail } from './s3-streams.mts'

export { MAX_SES_INBOUND_BYTES } from './s3-streams.mts'

export type SesInboundObjectPage = {
  objectKeys: string[]
  nextContinuationToken?: string
}

export type SesInboundSourceIdentity = { eTag: string; versionId?: string }

/* no-mistakes: integration=aws */
export async function loadSesInboundObject(objectKey: string): Promise<Readable> {
  return (await loadSesInboundObjectWithMetadata(objectKey)).body
}

/* no-mistakes: integration=aws */
async function loadSesInboundObjectWithMetadata(
  objectKey: string,
  sourceIdentity?: SesInboundSourceIdentity,
): Promise<{ body: Readable; receivedAt: Date; sourceIdentity: SesInboundSourceIdentity }> {
  const response = await S3ImagesClient.send(
    new GetObjectCommand({
      Bucket: getSesInboundBucket(),
      Key: objectKey,
      ...(sourceIdentity?.versionId ? { VersionId: sourceIdentity.versionId } : {}),
      ...(!sourceIdentity?.versionId && sourceIdentity?.eTag
        ? { IfMatch: sourceIdentity.eTag }
        : {}),
    }),
  )
  rejectOversizedRawEmail(response.ContentLength)
  if (!response.Body) throw new SesInboundTerminalError('Raw SES object has no body')
  if (!response.LastModified)
    throw new SesInboundTerminalError('Raw SES object has no receipt time')
  if (!response.ETag) throw new SesInboundTerminalError('Raw SES object has no entity tag')
  return {
    body: boundedBodyStream(response.Body),
    receivedAt: response.LastModified,
    sourceIdentity: {
      eTag: response.ETag,
      ...(response.VersionId ? { versionId: response.VersionId } : {}),
    },
  }
}

export async function loadSesInboundObjectVersion(
  objectKey: string,
  sourceIdentity: SesInboundSourceIdentity,
): Promise<Readable> {
  return (await loadSesInboundObjectWithMetadata(objectKey, sourceIdentity)).body
}

/* no-mistakes: integration=aws */
export async function deleteSesInboundObject(objectKey: string): Promise<void> {
  await S3ImagesClient.send(
    new DeleteObjectCommand({ Bucket: getSesInboundBucket(), Key: objectKey }),
  )
}

/**
 * Copies the original RFC 5322 message before the normal SES cleanup path can delete it. The
 * deterministic destination makes S3 at-least-once delivery replay safe; its digest is recorded
 * separately from the parsed source stream by `loadSesInboundObjectAndHash`.
 */
/* no-mistakes: integration=aws */
export async function copySesInboundObjectToCopyrightEvidence(
  objectKey: string,
  sesMessageId: string,
  sha256: Buffer,
  sourceIdentity: SesInboundSourceIdentity,
): Promise<string> {
  const sourceBucket = getSesInboundBucket()
  const destinationBucket = getCopyrightEvidenceBucket()
  const destinationKey = `email/${sesMessageId}/${sha256.toString('hex')}.eml`
  const encodedSource = `${sourceBucket}/${encodeURIComponent(objectKey).replaceAll('%2F', '/')}`
  await S3ImagesClient.send(
    new CopyObjectCommand({
      Bucket: destinationBucket,
      Key: destinationKey,
      CopySource: sourceIdentity.versionId
        ? `${encodedSource}?versionId=${encodeURIComponent(sourceIdentity.versionId)}`
        : encodedSource,
      CopySourceIfMatch: sourceIdentity.eTag,
      MetadataDirective: 'COPY',
    }),
  )
  return destinationKey
}

export async function loadSesInboundObjectAndHash(objectKey: string): Promise<{
  rawMime: Readable
  digest: Promise<{ sha256: Buffer; byteSize: number }>
  receivedAt: Date
  sourceIdentity: SesInboundSourceIdentity
}> {
  const {
    body: source,
    receivedAt,
    sourceIdentity,
  } = await loadSesInboundObjectWithMetadata(objectKey)
  const hash = createHash('sha256')
  let byteSize = 0
  let resolveDigest!: (value: { sha256: Buffer; byteSize: number }) => void
  let rejectDigest!: (reason: unknown) => void
  const digest = new Promise<{ sha256: Buffer; byteSize: number }>((resolve, reject) => {
    resolveDigest = resolve
    rejectDigest = reject
  })
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk)
      byteSize += chunk.byteLength
      callback(null, chunk)
    },
  })
  source.once('error', error => counter.destroy(error))
  counter.once('error', rejectDigest)
  counter.once('end', () => resolveDigest({ sha256: hash.digest(), byteSize }))
  source.pipe(counter)
  return { rawMime: counter, digest, receivedAt, sourceIdentity }
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
  return listSesInboundObjectsWithPrefix(SES_INBOUND_INCOMING_PREFIX, continuationToken)
}

export async function listCopyrightSesInboundObjects(
  continuationToken?: string,
): Promise<SesInboundObjectPage> {
  return listSesInboundObjectsWithPrefix(SES_INBOUND_COPYRIGHT_PREFIX, continuationToken)
}

/* no-mistakes: integration=aws */
async function listSesInboundObjectsWithPrefix(
  prefix: string,
  continuationToken?: string,
): Promise<SesInboundObjectPage> {
  const page = await S3ImagesClient.send(
    new ListObjectsV2Command({
      Bucket: getSesInboundBucket(),
      Prefix: prefix,
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

function getCopyrightEvidenceBucket(): string {
  const bucket = process.env.S3_BUCKET_COPYRIGHT_EVIDENCE?.trim()
  if (!bucket) throw new Error('S3_BUCKET_COPYRIGHT_EVIDENCE is required')
  return bucket
}
