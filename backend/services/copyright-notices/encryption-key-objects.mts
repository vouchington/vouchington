import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { S3ImagesClient } from '@modules/aws'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'

export const COPYRIGHT_RETENTION_KEY_PREFIX = 'retention-keys/'
const MAX_WRAPPED_KEY_BYTES = 4096

export function copyrightRetentionKeyObjectPath(keyId: string): string {
  return `${COPYRIGHT_RETENTION_KEY_PREFIX}${keyId}`
}

export function getCopyrightRetentionKeyBucket(): string {
  const value = process.env.S3_BUCKET_COPYRIGHT_EVIDENCE?.trim()
  if (!value)
    throw new Error('S3_BUCKET_COPYRIGHT_EVIDENCE is required for copyright encryption keys')
  return value
}

/** One immutable object per UUIDv7 handle; existing KEK slots remain usable across rotation. */
export async function putCopyrightEncryptionKeyObject(keyId: string, key: Buffer): Promise<void> {
  const wrapped = encryptSecret(key.toString('base64'), `copyright-retention-key:${keyId}`)
  await S3ImagesClient.send(
    new PutObjectCommand({
      Bucket: getCopyrightRetentionKeyBucket(),
      Key: copyrightRetentionKeyObjectPath(keyId),
      Body: wrapped,
      ContentType: 'application/octet-stream',
      IfNoneMatch: '*',
    }),
  )
}

/** Missing authority fails closed, including after a database restore recovers an expired handle. */
export async function readCopyrightEncryptionKeyObject(keyId: string): Promise<Buffer> {
  const response = await S3ImagesClient.send(
    new GetObjectCommand({
      Bucket: getCopyrightRetentionKeyBucket(),
      Key: copyrightRetentionKeyObjectPath(keyId),
    }),
  )
  if (!response.Body || (response.ContentLength ?? 0) > MAX_WRAPPED_KEY_BYTES)
    throw new Error('Invalid copyright encryption key object')
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    length += chunk.byteLength
    if (length > MAX_WRAPPED_KEY_BYTES)
      throw new Error('Copyright encryption key object is too large')
    chunks.push(Buffer.from(chunk))
  }
  const encoded = decryptSecret(
    Buffer.concat(chunks, length).toString('utf8'),
    `copyright-retention-key:${keyId}`,
  )
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32) throw new Error('Invalid copyright encryption data key')
  return key
}

/** Unique objects are never overwritten: one data version is the admission contract. */
export async function destroyCopyrightEncryptionKeyObject(keyId: string): Promise<void> {
  const { DeleteObjectsCommand, ListObjectVersionsCommand } = await import('@aws-sdk/client-s3')
  const objectPath = copyrightRetentionKeyObjectPath(keyId)
  const request = { Bucket: getCopyrightRetentionKeyBucket(), Prefix: objectPath, MaxKeys: 2 }
  const listed = await S3ImagesClient.send(new ListObjectVersionsCommand(request))
  if (listed.IsTruncated)
    throw new Error('Copyright key object violates immutable-version admission')
  const versions = [...(listed.Versions ?? []), ...(listed.DeleteMarkers ?? [])].flatMap(entry =>
    entry.Key === objectPath && entry.VersionId
      ? [{ Key: objectPath, VersionId: entry.VersionId }]
      : [],
  )
  if (versions.length > 0) {
    const deleted = await S3ImagesClient.send(
      new DeleteObjectsCommand({
        Bucket: getCopyrightRetentionKeyBucket(),
        Delete: { Objects: versions, Quiet: true },
      }),
    )
    if (deleted.Errors?.length) throw new Error('Copyright key object deletion was refused')
  }
  const confirmed = await S3ImagesClient.send(new ListObjectVersionsCommand(request))
  if (
    confirmed.IsTruncated ||
    [...(confirmed.Versions ?? []), ...(confirmed.DeleteMarkers ?? [])].some(
      entry => entry.Key === objectPath,
    )
  )
    throw new Error('Copyright key object versions remain')
}
