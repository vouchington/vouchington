import { describe, expect, it } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { getDeployEnvironment } from '@ts-shared/deploy-environment'
import { putS3Object, uniqueS3Prefix } from '@voucha/test-helpers/aws-emulator-s3'
import { getImageFromS3 } from '../s3.mts'

describe('getImageFromS3', () => {
  it('reads the stored image from the images bucket', async () => {
    const key = `${uniqueS3Prefix('get-image')}image`
    await putS3Object({
      Bucket: S3Buckets.images,
      Key: key,
      Body: 'stored image bytes',
      ContentType: 'image/png',
    })

    const result = await getImageFromS3(getDeployEnvironment(), key)

    expect(result.ContentType).toBe('image/png')
    await expect(result.Body?.transformToString()).resolves.toBe('stored image bytes')
  })

  it('rejects a key that is not stored', async () => {
    const key = `${uniqueS3Prefix('get-image')}missing`

    await expect(getImageFromS3(getDeployEnvironment(), key)).rejects.toMatchObject({
      name: 'NoSuchKey',
    })
  })
})
