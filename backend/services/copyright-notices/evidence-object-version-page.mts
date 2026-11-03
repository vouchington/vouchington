import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  type ObjectIdentifier,
} from '@aws-sdk/client-s3'
import { S3ImagesClient } from '@modules/aws'

// S3 DeleteObjects accepts at most 1,000 keys: https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html
const DELETE_BATCH_SIZE = 1000
const REQUEST_TIMEOUT_MS = 20_000

/** Delete one physical version page for an exact key. A later call restarts at the remaining head. */
export async function deleteCopyrightEvidenceObjectVersionPage(
  key: string,
  workLimit: number,
): Promise<{ hasMore: boolean; scanned: number }> {
  if (!Number.isSafeInteger(workLimit) || workLimit < 1)
    throw new Error('Invalid copyright evidence work limit')
  const bucket = process.env.S3_BUCKET_COPYRIGHT_EVIDENCE?.trim()
  if (!bucket) throw new Error('S3_BUCKET_COPYRIGHT_EVIDENCE is required to erase evidence')
  const page = await S3ImagesClient.send(
    new ListObjectVersionsCommand({
      Bucket: bucket,
      Prefix: key,
      MaxKeys: Math.min(workLimit, DELETE_BATCH_SIZE),
    }),
    { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  )
  const versions: ObjectIdentifier[] = []
  for (const entry of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) {
    if (entry.Key === key && entry.VersionId)
      versions.push({ Key: key, VersionId: entry.VersionId })
  }
  if (versions.length > 0) await deleteVersions(bucket, versions)
  // Exact-key versions sort before longer keys sharing the prefix. This single-entry check
  // confirms completion without traversing unrelated prefixed keys or every old version.
  const confirmation = await S3ImagesClient.send(
    new ListObjectVersionsCommand({
      Bucket: bucket,
      Prefix: key,
      MaxKeys: 1,
    }),
    { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  )
  return {
    hasMore: [...(confirmation.Versions ?? []), ...(confirmation.DeleteMarkers ?? [])].some(
      entry => entry.Key === key,
    ),
    scanned: (page.Versions?.length ?? 0) + (page.DeleteMarkers?.length ?? 0),
  }
}

async function deleteVersions(bucket: string, versions: ObjectIdentifier[]): Promise<void> {
  for (let start = 0; start < versions.length; start += DELETE_BATCH_SIZE) {
    // oxlint-disable-next-line no-await-in-loop -- a failed batch must stop the keys after it.
    const result = await S3ImagesClient.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: versions.slice(start, start + DELETE_BATCH_SIZE), Quiet: true },
      }),
      { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    )
    // DeleteObjects answers 200 even when individual versions were refused (missing IAM, hold).
    if (result.Errors?.length) {
      throw new Error(`Copyright evidence delete refused ${result.Errors.length} object versions`)
    }
  }
}
