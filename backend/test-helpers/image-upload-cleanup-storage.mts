import { S3Buckets } from '../modules/aws/s3.mts'
import { putS3Object, s3ObjectExists } from './aws-emulator-s3.mts'
import { useMissingS3Bucket } from './missing-s3-bucket.mts'

type CleanupBucket = 'imageUploads' | 'images'
type StoredObject = { Bucket: string; Key: string }

/**
 * Store every owned key in both the uploads and the images bucket of the AWS Emulator, so a test
 * reads which objects the code under test actually deleted and that it left every other one.
 * Owned keys are image ids or random digests, so concurrent forks never share an object.
 */
export async function seedOwnedUploadCleanupStorage(ownedKeys: readonly string[]) {
  const buckets = { imageUploads: S3Buckets.imageUploads, images: S3Buckets.images }
  const objects: StoredObject[] = [buckets.imageUploads, buckets.images].flatMap(Bucket =>
    [...new Set(ownedKeys)].map(Key => ({ Bucket, Key })),
  )
  const put = (object: StoredObject) =>
    putS3Object({ ...object, Body: `owned ${object.Bucket}/${object.Key}` })
  await Promise.all(objects.map(put))

  const deleted = async () => {
    const present = await Promise.all(objects.map(({ Bucket, Key }) => s3ObjectExists(Bucket, Key)))
    return objects.filter((_, index) => !present[index])
  }

  return {
    buckets,
    /** Owned objects no longer stored, uploads bucket first, each in owned-key order. */
    deleted,
    /** Store again every owned object a previous pass deleted. */
    async restock() {
      await Promise.all((await deleted()).map(put))
    },
    /** Reject one bucket's requests with NoSuchBucket until the returned restore runs. */
    failBucket: (name: CleanupBucket) => useMissingS3Bucket(name),
  }
}
