import {
  DeleteBucketPolicyCommand,
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { afterEach, beforeEach, vi } from 'vitest'
import { createTestS3Bucket, emulatorS3 } from '../../aws-emulator-s3.mts'

export type CopyrightEvidenceBucket = {
  /** The emulator bucket `S3_BUCKET_COPYRIGHT_EVIDENCE` names for the current test. */
  name(): string
  /** Writes `versions` object versions of `key`, then a delete marker on top if asked. */
  put(key: string, options?: { versions?: number; deleteMarker?: boolean }): Promise<void>
  /** How many versions and delete markers of exactly `key` the bucket still holds. */
  countVersions(key: string): Promise<number>
  /** An explicit-deny policy makes `DeleteObjects` answer 200 with an `Errors` entry per version. */
  refuse(key: string): Promise<void>
  allow(key: string): Promise<void>
}

/**
 * A fresh versioned AWS Emulator bucket per test, named by `S3_BUCKET_COPYRIGHT_EVIDENCE`. A refusal
 * is the bucket policy denial production sees when IAM withholds `s3:DeleteObjectVersion`.
 */
export function useCopyrightEvidenceBucket(): CopyrightEvidenceBucket {
  let bucket: string | undefined
  const refused = new Set<string>()

  beforeEach(async () => {
    refused.clear()
    bucket = await createTestS3Bucket('copyright-evidence', { versioned: true })
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', bucket)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function name(): string {
    if (!bucket) throw new Error('The copyright evidence bucket exists only inside a test')
    return bucket
  }

  async function applyRefusals(): Promise<void> {
    const Bucket = name()
    if (refused.size === 0) {
      await emulatorS3().send(new DeleteBucketPolicyCommand({ Bucket }))
      return
    }
    await emulatorS3().send(
      new PutBucketPolicyCommand({
        Bucket,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Deny',
              Principal: '*',
              Action: 's3:DeleteObjectVersion',
              Resource: [...refused].map(key => `arn:aws:s3:::${Bucket}/${key}`),
            },
          ],
        }),
      }),
    )
  }

  return {
    name,
    async put(key, options = {}) {
      const Bucket = name()
      await Promise.all(
        Array.from({ length: options.versions ?? 1 }, (_, version) =>
          emulatorS3().send(new PutObjectCommand({ Bucket, Key: key, Body: `v${version}` })),
        ),
      )
      if (options.deleteMarker) {
        await emulatorS3().send(new DeleteObjectCommand({ Bucket, Key: key }))
      }
    },
    async countVersions(key) {
      let count = 0
      let KeyMarker: string | undefined
      let VersionIdMarker: string | undefined
      for (;;) {
        const page = await emulatorS3().send(
          new ListObjectVersionsCommand({
            Bucket: name(),
            Prefix: key,
            KeyMarker,
            VersionIdMarker,
          }),
        )
        for (const entry of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) {
          if (entry.Key === key) count += 1
        }
        if (!page.IsTruncated) return count
        KeyMarker = page.NextKeyMarker
        VersionIdMarker = page.NextVersionIdMarker
      }
    },
    async refuse(key) {
      refused.add(key)
      await applyRefusals()
    },
    async allow(key) {
      refused.delete(key)
      await applyRefusals()
    },
  }
}
