import { randomUUID } from 'node:crypto'
import { S3Buckets } from '../modules/aws/s3.mts'
import { onTestFinished } from 'vitest'

/**
 * Point the application's configured bucket at one that does not exist, so the AWS Emulator
 * rejects that bucket's requests with a real NoSuchBucket error. The returned restore (also run
 * when the test finishes) points it back; requests to every other bucket are unaffected.
 */
export function useMissingS3Bucket(name: keyof typeof S3Buckets): () => void {
  const bucket = S3Buckets[name]
  S3Buckets[name] = `missing-${name.toLowerCase()}-${randomUUID()}`
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    S3Buckets[name] = bucket
  }
  onTestFinished(restore)
  return restore
}
