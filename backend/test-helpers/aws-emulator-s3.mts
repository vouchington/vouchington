import { randomUUID } from 'node:crypto'
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3'
import { fetch } from 'undici'
import { createAwsEmulatorLoopbackDispatcher } from './aws-emulator-dispatchers.mts'

// Reads the endpoint and keys that `vitest.setup.aws-emulator.mts` exported, independently of the
// application's clients, so a test can seed and inspect emulator state without going through the
// code under test.
let client: S3Client | undefined

export function emulatorS3(): S3Client {
  client ??= new S3Client({ region: process.env.AWS_REGION ?? 'us-west-2' })
  return client
}

/** A key prefix no other test or concurrent fork can produce. */
export function uniqueS3Prefix(label: string): string {
  return `test/${label}/${randomUUID()}/`
}

/** A bucket owned by one test file, for code that reads its bucket name from the environment. */
export async function createTestS3Bucket(
  label: string,
  options: { versioned?: boolean } = {},
): Promise<string> {
  const Bucket = `test-${label}-${randomUUID()}`.toLowerCase().slice(0, 63)
  await emulatorS3().send(new CreateBucketCommand({ Bucket }))
  if (options.versioned) {
    await emulatorS3().send(
      new PutBucketVersioningCommand({ Bucket, VersioningConfiguration: { Status: 'Enabled' } }),
    )
  }
  return Bucket
}

export async function putS3Object(
  input: Omit<PutObjectCommandInput, 'Body'> & { Body: string | Uint8Array },
): Promise<{ versionId?: string }> {
  const result = await emulatorS3().send(new PutObjectCommand(input))
  return { versionId: result.VersionId }
}

export async function readS3ObjectText(Bucket: string, Key: string): Promise<string | undefined> {
  try {
    const result = await emulatorS3().send(new GetObjectCommand({ Bucket, Key }))
    return await result.Body?.transformToString()
  } catch (err) {
    if ((err as { name?: string }).name === 'NoSuchKey') return undefined
    throw err
  }
}

export async function readS3ObjectBytes(Bucket: string, Key: string): Promise<Buffer | undefined> {
  try {
    const result = await emulatorS3().send(new GetObjectCommand({ Bucket, Key }))
    const bytes = await result.Body?.transformToByteArray()
    return bytes ? Buffer.from(bytes) : undefined
  } catch (err) {
    if ((err as { name?: string }).name === 'NoSuchKey') return undefined
    throw err
  }
}

export async function s3ObjectExists(Bucket: string, Key: string): Promise<boolean> {
  try {
    await emulatorS3().send(new HeadObjectCommand({ Bucket, Key }))
    return true
  } catch (err) {
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
      return false
    }
    throw err
  }
}

/** Every current key under a prefix, sorted. */
export async function listS3Keys(Bucket: string, Prefix: string): Promise<string[]> {
  const keys: string[] = []
  let ContinuationToken: string | undefined
  do {
    const page = await emulatorS3().send(
      new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }),
    )
    keys.push(...(page.Contents ?? []).flatMap(object => (object.Key ? [object.Key] : [])))
    ContinuationToken = page.NextContinuationToken
  } while (ContinuationToken)
  return keys.toSorted()
}

/** Every version and delete marker under a prefix, for versioned buckets. */
export async function listS3Versions(
  Bucket: string,
  Prefix: string,
): Promise<Array<{ key: string; versionId: string; deleteMarker: boolean }>> {
  const page = await emulatorS3().send(new ListObjectVersionsCommand({ Bucket, Prefix }))
  return [
    ...(page.Versions ?? []).map(v => ({
      key: v.Key!,
      versionId: v.VersionId!,
      deleteMarker: false,
    })),
    ...(page.DeleteMarkers ?? []).map(v => ({
      key: v.Key!,
      versionId: v.VersionId!,
      deleteMarker: true,
    })),
  ]
}

export async function deleteS3Object(Bucket: string, Key: string): Promise<void> {
  await emulatorS3().send(new DeleteObjectCommand({ Bucket, Key }))
}

/** Sends a request to a presigned URL the way a browser would, straight to the emulator. */
export async function sendToPresignedS3Url(
  url: string,
  init: { method: 'GET' | 'PUT'; contentType?: string; body?: Uint8Array },
): Promise<{ status: number; body: string }> {
  const dispatcher = createAwsEmulatorLoopbackDispatcher()
  try {
    const response = await fetch(url, {
      dispatcher,
      method: init.method,
      ...(init.contentType ? { headers: { 'content-type': init.contentType } } : {}),
      ...(init.body ? { body: init.body } : {}),
    })
    return { status: response.status, body: await response.text() }
  } finally {
    await dispatcher.close()
  }
}
