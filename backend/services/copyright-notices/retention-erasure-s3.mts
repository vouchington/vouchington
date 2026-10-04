import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  type ObjectIdentifier,
} from '@aws-sdk/client-s3'
import { S3ImagesClient } from '@modules/aws'

// S3 DeleteObjects accepts at most 1,000 keys: https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html
const DELETE_BATCH_SIZE = 1000

/** Every stored version and delete marker whose key is exactly `key` (the listing is by prefix). */
async function listVersions(bucket: string, key: string): Promise<ObjectIdentifier[]> {
  const found: ObjectIdentifier[] = []
  let keyMarker: string | undefined
  let versionIdMarker: string | undefined
  do {
    // oxlint-disable-next-line no-await-in-loop -- each page's markers come from the previous page.
    const page = await S3ImagesClient.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: key,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }),
    )
    for (const entry of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) {
      if (entry.Key === key && entry.VersionId) found.push({ Key: key, VersionId: entry.VersionId })
    }
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined
    versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined
  } while (keyMarker !== undefined || versionIdMarker !== undefined)
  return found
}

async function deleteVersions(bucket: string, versions: ObjectIdentifier[]): Promise<void> {
  for (let start = 0; start < versions.length; start += DELETE_BATCH_SIZE) {
    // oxlint-disable-next-line no-await-in-loop -- a failed batch must stop the keys after it.
    const result = await S3ImagesClient.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: versions.slice(start, start + DELETE_BATCH_SIZE), Quiet: true },
      }),
    )
    // DeleteObjects answers 200 even when individual versions were refused (missing IAM, hold).
    if (result.Errors?.length) {
      throw new Error(`Copyright evidence delete refused ${result.Errors.length} object versions`)
    }
  }
}

/**
 * Permanently removes every version and delete marker of each key from the versioned evidence
 * bucket, then lists again to confirm nothing is left. It throws on any refusal or leftover so the
 * caller keeps the database rows that point at the objects; a rerun starts from whatever remains.
 * Keys are never put in an error message.
 */
export async function deleteCopyrightEvidenceObjectVersions(
  keys: readonly string[],
): Promise<void> {
  if (keys.length === 0) return
  const bucket = process.env.S3_BUCKET_COPYRIGHT_EVIDENCE?.trim()
  if (!bucket) throw new Error('S3_BUCKET_COPYRIGHT_EVIDENCE is required to erase evidence')
  for (const key of keys) {
    // oxlint-disable-next-line no-await-in-loop -- one key at a time keeps a refusal attributable.
    await deleteVersions(bucket, await listVersions(bucket, key))
    // oxlint-disable-next-line no-await-in-loop -- the confirmation follows its own key's delete.
    if ((await listVersions(bucket, key)).length > 0) {
      throw new Error('Copyright evidence object versions remain after delete')
    }
  }
}
