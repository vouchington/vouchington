import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { S3Buckets } from '@modules/aws'
import {
  listS3Keys,
  putS3Object,
  readS3ObjectText,
  s3ObjectExists,
  uniqueS3Prefix,
} from '@voucha/test-helpers/aws-emulator-s3'
import { denyS3ObjectActions, useOwnedS3Bucket } from '@voucha/test-helpers/s3-owned-bucket'
import { copyImageToQuarantine, deleteImageRenders, deleteImagesFromS3 } from './s3.mts'

// The emulator rejects a DeleteObjects request whose XML carries a control character.
const MALFORMED_KEY = 'malformed\u0001key'

async function seedImages(count: number) {
  const prefix = uniqueS3Prefix('delete-images')
  const keys = Array.from({ length: count }, (_, index) => `${prefix}image-${index}`)
  await Promise.all(keys.map(Key => putS3Object({ Bucket: S3Buckets.images, Key, Body: Key })))
  return { prefix, keys }
}

describe('copyImageToQuarantine', () => {
  it('copies image from images bucket to quarantine bucket', async () => {
    const s3Key = `${uniqueS3Prefix('quarantine')}image`
    await putS3Object({ Bucket: S3Buckets.images, Key: s3Key, Body: 'flagged image' })

    await copyImageToQuarantine({ s3_key: s3Key })

    await expect(readS3ObjectText(S3Buckets.quarantine, s3Key)).resolves.toBe('flagged image')
    await expect(readS3ObjectText(S3Buckets.images, s3Key)).resolves.toBe('flagged image')
  })

  it('rejects when the source image is not stored', async () => {
    const s3Key = `${uniqueS3Prefix('quarantine')}missing`

    await expect(copyImageToQuarantine({ s3_key: s3Key })).rejects.toMatchObject({
      name: 'NoSuchKey',
    })
    await expect(s3ObjectExists(S3Buckets.quarantine, s3Key)).resolves.toBe(false)
  })
})

describe('deleteImagesFromS3', () => {
  it('deletes only the selected images', async () => {
    const { prefix, keys } = await seedImages(4)

    await deleteImagesFromS3(keys.slice(0, 3).map(s3_key => ({ s3_key })))

    await expect(listS3Keys(S3Buckets.images, prefix)).resolves.toEqual(keys.slice(3))
  })

  it.each([0, 1001, 1.5])(
    'rejects invalid provider batch size %s before sending',
    async batchSize => {
      const { prefix, keys } = await seedImages(1)

      await expect(deleteImagesFromS3([{ s3_key: keys[0] }], batchSize)).rejects.toThrow(RangeError)
      await expect(listS3Keys(S3Buckets.images, prefix)).resolves.toEqual(keys)
    },
  )

  it('reports per-object provider errors as an aggregate', async () => {
    // A bucket policy replaces the whole bucket's policy, so the denial gets its own bucket.
    await useOwnedS3Bucket('images')
    const { prefix, keys } = await seedImages(2)
    const [, deniedKey] = keys
    await denyS3ObjectActions(S3Buckets.images, [{ action: 's3:DeleteObject', keys: [deniedKey] }])

    const error = await deleteImagesFromS3(keys.map(s3_key => ({ s3_key }))).catch(
      (err: unknown) => err,
    )

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(`Failed to delete image ${deniedKey}: `),
      }),
    ])
    await expect(listS3Keys(S3Buckets.images, prefix)).resolves.toEqual([deniedKey])
  })

  it('deletes images across a bounded provider request boundary', async () => {
    const { prefix, keys } = await seedImages(3)

    await deleteImagesFromS3(
      keys.map(s3_key => ({ s3_key })),
      2,
    )

    await expect(listS3Keys(S3Buckets.images, prefix)).resolves.toEqual([])
  })

  it('attempts later chunks and aggregates provider request failures', async () => {
    const { prefix, keys } = await seedImages(3)
    const [first, second, last] = keys

    const error = await deleteImagesFromS3(
      [first, MALFORMED_KEY, MALFORMED_KEY, second, last].map(s3_key => ({ s3_key })),
      2,
    ).catch((err: unknown) => err)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([
      expect.objectContaining({ name: 'MalformedXML' }),
      expect.objectContaining({ name: 'MalformedXML' }),
    ])
    // Only the last chunk was accepted; the rejected chunks left their images stored.
    await expect(listS3Keys(S3Buckets.images, prefix)).resolves.toEqual([first, second])
  })
})

describe('deleteImageRenders', () => {
  it('leaves other renders in place when the image has none', async () => {
    const s3Key = `${uniqueS3Prefix('renders')}image`
    const sibling = `${s3Key}x--100x100.webp`
    await putS3Object({ Bucket: S3Buckets.renders, Key: sibling, Body: 'sibling render' })

    await deleteImageRenders(s3Key)

    await expect(s3ObjectExists(S3Buckets.renders, sibling)).resolves.toBe(true)
  })

  it('deletes every render of the image', async () => {
    const prefix = uniqueS3Prefix('renders')
    const s3Key = `${prefix}image`
    const renders = [`${s3Key}--100x100.webp`, `${s3Key}--200x200.webp`]
    const sibling = `${prefix}other-${randomUUID()}--100x100.webp`
    await Promise.all(
      [...renders, sibling].map(Key => putS3Object({ Bucket: S3Buckets.renders, Key, Body: Key })),
    )

    await deleteImageRenders(s3Key)

    await expect(listS3Keys(S3Buckets.renders, prefix)).resolves.toEqual([sibling])
  })
})
