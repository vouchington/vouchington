import { S3Client, paginateListObjectsV2 } from '@aws-sdk/client-s3'
import { describe, expect, it } from 'vitest'
import { AWS_REGION } from './config.mts'
import { S3Buckets, S3ImagesClient } from './s3.mts'

describe('S3ImagesClient proxy contract', () => {
  it('is not an instanceof S3Client, since the lazy Proxy only implements a get trap', () => {
    expect(S3ImagesClient instanceof S3Client).toBe(false)
  })

  it('a real S3Client instance passes instanceof, proving the check above is meaningful', () => {
    expect(new S3Client({ region: AWS_REGION }) instanceof S3Client).toBe(true)
  })

  it('still forwards member access through the get trap', () => {
    expect(typeof S3ImagesClient.send).toBe('function')
    expect(S3ImagesClient.config).toBeDefined()
  })

  it('rejects AWS SDK paginators, since createPaginator() dispatch checks instanceof before every request', async () => {
    const paginator = paginateListObjectsV2(
      { client: S3ImagesClient },
      { Bucket: S3Buckets.images },
    )

    await expect(paginator.next()).rejects.toThrow(/Invalid client/)
  })
})
