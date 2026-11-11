import { S3Buckets } from '../modules/aws/s3.mts'
import { listS3Keys, putS3Object, readS3ObjectText, s3ObjectExists } from './aws-emulator-s3.mts'
import { useMissingS3Bucket } from './missing-s3-bucket.mts'

type Image = { id: string; s3_key: string }

/**
 * Seed one image's real storage in the AWS Emulator: the delivered original under its digest key
 * and image-ID alias, plus one render per key. Every key derives from the image's own id, so
 * concurrent forks never share an object.
 */
export async function seedImageQuarantineStorage(
  image: Image,
  options: { original?: boolean } = {},
) {
  const original = `original image ${image.id}`
  const rendersBucket = S3Buckets.renders
  const keys = [...new Set([image.s3_key, image.id])]
  const renderKeys = keys.map(key => `${key}--w640.webp`)
  const storeOriginal = async () => {
    await Promise.all(
      keys.map(Key =>
        putS3Object({ Bucket: S3Buckets.images, Key, Body: original, ContentType: 'image/png' }),
      ),
    )
  }
  await Promise.all(
    renderKeys.map(Key => putS3Object({ Bucket: rendersBucket, Key, Body: `render ${Key}` })),
  )
  if (options.original !== false) await storeOriginal()

  return {
    original,
    renderKeys,
    /** Store the original after an initial copy found nothing to copy. */
    storeOriginal,
    quarantineCopy: () => readS3ObjectText(S3Buckets.quarantine, image.s3_key),
    storedOriginalKeys: async () =>
      (
        await Promise.all(
          keys.map(async key => ((await s3ObjectExists(S3Buckets.images, key)) ? [key] : [])),
        )
      ).flat(),
    storedRenderKeys: async () =>
      (await Promise.all(keys.map(key => listS3Keys(rendersBucket, `${key}--`)))).flat(),
    /** Point render cleanup at a bucket that does not exist, so the emulator rejects it. */
    failRenders() {
      useMissingS3Bucket('renders')
    },
  }
}
