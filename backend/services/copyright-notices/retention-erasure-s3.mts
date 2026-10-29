import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  type ObjectIdentifier,
} from '@aws-sdk/client-s3'
import { S3ImagesClient } from '@modules/aws'

async function headVersions(
  bucket: string,
  key: string,
  pageSize: number,
): Promise<{ versions: ObjectIdentifier[]; scanned: number }> {
  const page = await S3ImagesClient.send(
    new ListObjectVersionsCommand({
      Bucket: bucket,
      Prefix: key,
      MaxKeys: pageSize,
    }),
  )
  const entries = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
  if (page.IsTruncated && !entries.length)
    throw new Error('Copyright version listing omitted its truncated head')
  if (entries.length > pageSize)
    throw new Error('Copyright version listing exceeded its requested cap')
  if (entries.some(entry => !entry.Key || !entry.Key.startsWith(key) || !entry.VersionId))
    throw new Error('Copyright version listing returned an invalid identity')
  return {
    scanned: entries.length,
    versions: entries.flatMap(entry =>
      entry.Key === key ? [{ Key: key, VersionId: entry.VersionId! }] : [],
    ),
  }
}

/**
 * Delete one bounded head batch, then confirm from a new head listing. Never reuse a deleted
 * VersionIdMarker. S3 orders keys lexicographically, then versions (including delete markers),
 * so an exact key precedes every longer prefix neighbor. An exact-key-free head proves absence.
 * https://docs.aws.amazon.com/AWSJavaSDK/latest/javadoc/com/amazonaws/services/s3/model/ListVersionsRequest.html
 */
export async function deleteCopyrightEvidenceObjectVersionPage(
  key: string,
  pageSize: number,
): Promise<{ hasMore: boolean; scanned: number }> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000)
    throw new RangeError('Invalid copyright S3 version page cap')
  const bucket = process.env.S3_BUCKET_COPYRIGHT_EVIDENCE?.trim()
  if (!bucket) throw new Error('S3_BUCKET_COPYRIGHT_EVIDENCE is required to erase evidence')
  const page = await headVersions(bucket, key, pageSize)
  if (!page.versions.length) return { hasMore: false, scanned: page.scanned }
  const deleted = await S3ImagesClient.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: page.versions, Quiet: true },
    }),
  )
  if (deleted.Errors?.length)
    throw new Error('Copyright evidence object version deletion was refused')
  return {
    hasMore: (await headVersions(bucket, key, 1)).versions.length > 0,
    scanned: page.scanned,
  }
}
