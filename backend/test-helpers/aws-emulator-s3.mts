import { S3Client, type PutObjectCommandInput } from '@aws-sdk/client-s3'
import {
  createTestS3Bucket as createBucket,
  deleteS3Object as deleteObject,
  listS3Keys as listKeys,
  listS3Versions as listVersions,
  putS3Object as putObject,
  readS3ObjectBytes as readBytes,
  readS3ObjectText as readText,
  s3ObjectExists as objectExists,
  sendToPresignedS3Url as sendToPresigned,
  uniqueS3Prefix,
} from '@vouchington/aws/testing'
import undici from 'undici'

export { uniqueS3Prefix }

// Reads the endpoint and keys that `vitest.setup.aws-emulator.mts` exported, independently of the
// application's clients, so a test can seed and inspect emulator state without going through the
// code under test.
let client: S3Client | undefined

export function emulatorS3(): S3Client {
  client ??= new S3Client({ region: process.env.AWS_REGION ?? 'us-west-2' })
  return client
}

export const createTestS3Bucket = (label: string, options?: { versioned?: boolean }) =>
  createBucket(emulatorS3(), label, options)

export const putS3Object = (
  input: Omit<PutObjectCommandInput, 'Body'> & { Body: string | Uint8Array },
) => putObject(emulatorS3(), input)

export const readS3ObjectText = (Bucket: string, Key: string) => readText(emulatorS3(), Bucket, Key)

export const readS3ObjectBytes = (Bucket: string, Key: string) =>
  readBytes(emulatorS3(), Bucket, Key)

export const s3ObjectExists = (Bucket: string, Key: string) =>
  objectExists(emulatorS3(), Bucket, Key)

export const listS3Keys = (Bucket: string, Prefix: string) => listKeys(emulatorS3(), Bucket, Prefix)

export const listS3Versions = (Bucket: string, Prefix: string) =>
  listVersions(emulatorS3(), Bucket, Prefix)

export const deleteS3Object = (Bucket: string, Key: string) =>
  deleteObject(emulatorS3(), Bucket, Key)

/**
 * Sends a request to a presigned URL the way a browser would. The application's external
 * dispatcher refuses loopback addresses and the emulator listens on loopback, so this uses a
 * plain agent.
 */
export async function sendToPresignedS3Url(
  url: string,
  init: { method: 'GET' | 'PUT'; contentType?: string; body?: Uint8Array },
): Promise<{ status: number; body: string }> {
  const dispatcher = new undici.Agent()
  try {
    return await sendToPresigned(
      url,
      init,
      (target, requestInit) =>
        undici.fetch(target, {
          ...(requestInit as object),
          dispatcher,
        }) as unknown as Promise<Response>,
    )
  } finally {
    await dispatcher.close()
  }
}
