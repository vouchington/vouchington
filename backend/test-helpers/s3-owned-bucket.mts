import { DeleteBucketPolicyCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3'
import { onTestFinished, vi } from 'vitest'
import { S3Buckets } from '../modules/aws/s3.mts'
import { createTestS3Bucket, emulatorS3 } from './aws-emulator-s3.mts'

type ApplicationBucket = keyof typeof S3Buckets

/**
 * Points one application bucket at a fresh AWS Emulator bucket for the current test. `S3Buckets`
 * is read at call time but built once per worker, so this is the seam for code that lists or
 * writes fixed keys (articles, sitemap metadata): it cannot see another fork's objects, and a
 * bucket policy set on it cannot reach a concurrent test.
 */
export async function useOwnedS3Bucket(name: ApplicationBucket): Promise<string> {
  const bucket = await createTestS3Bucket(name)
  const previous = S3Buckets[name]
  S3Buckets[name] = bucket
  onTestFinished(() => {
    S3Buckets[name] = previous
  })
  return bucket
}

export type S3DeniedObjectAction = 's3:GetObject' | 's3:PutObject' | 's3:DeleteObject'

// The SDK warns on console whenever a streamed upload fails, because it cannot retry it.
const STREAMING_UPLOAD_FAILURE_WARNING =
  'An error was encountered in a non-retryable streaming request.'

/**
 * Produces real `AccessDenied` failures for the named keys (`*` wildcards allowed) through an
 * explicit-deny bucket policy. Each call replaces the bucket's previous denials. A denied upload
 * is an expected failure, so the SDK's streaming-upload warning is dropped for this test.
 */
export async function denyS3ObjectActions(
  bucket: string,
  denials: ReadonlyArray<{ action: S3DeniedObjectAction; keys: readonly string[] }>,
): Promise<void> {
  if (denials.some(denial => denial.action === 's3:PutObject')) dropStreamingUploadWarning()
  await emulatorS3().send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: denials.map(({ action, keys }) => ({
          Effect: 'Deny',
          Principal: '*',
          Action: action,
          Resource: keys.map(key => `arn:aws:s3:::${bucket}/${key}`),
        })),
      }),
    }),
  )
}

export async function clearS3ObjectDenials(bucket: string): Promise<void> {
  await emulatorS3().send(new DeleteBucketPolicyCommand({ Bucket: bucket }))
}

function dropStreamingUploadWarning(): void {
  const warn = console.warn
  const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (args[0] !== STREAMING_UPLOAD_FAILURE_WARNING) Reflect.apply(warn, console, args)
  })
  onTestFinished(() => spy.mockRestore())
}
