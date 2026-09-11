import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => {
  const mockSend = vi.fn<VitestLooseMock>()
  const { S3Client } = await import('@aws-sdk/client-s3')
  const client = new S3Client({
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    region: 'us-east-1',
  })
  client.send = mockSend
  return {
    ...(await importOriginal<typeof import('@modules/aws')>()),
    S3ImagesClient: client,
  }
})

import { S3Buckets, S3ImagesClient } from '@modules/aws'
import { findTrackedDayRangeFromS3 } from './tracked-range-discovery.mts'

describe('findTrackedDayRangeFromS3', () => {
  const mockSend = vi.mocked(S3ImagesClient.send)

  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockReset()
    delete process.env.SITEMAP_S3_PREFIX
  })

  it('finds the earliest and latest valid days across every S3 page', async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'posts/2026/05/10/0.xml.gz/metadata.json' },
          { Key: 'posts/not-a-day/0.xml.gz/metadata.json' },
        ],
        NextContinuationToken: 'page-2',
      } as never)
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'posts/2026/01/02/0.xml.gz/metadata.json' },
          { Key: 'posts/2026/12/31/0.xml.gz/metadata.json' },
        ],
      } as never)

    await expect(findTrackedDayRangeFromS3()).resolves.toEqual({
      earliestDay: '2026-01-02',
      latestDay: '2026-12-31',
    })
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect((mockSend.mock.calls[0]![0] as ListObjectsV2Command).input).toMatchObject({
      Bucket: S3Buckets.sitemaps,
      Prefix: 'posts/',
    })
    expect((mockSend.mock.calls[1]![0] as ListObjectsV2Command).input).toMatchObject({
      ContinuationToken: 'page-2',
    })
  })

  it('returns null when S3 has no valid tracked-day keys', async () => {
    mockSend.mockResolvedValueOnce({ Contents: [{ Key: 'posts/README.md' }] } as never)

    await expect(findTrackedDayRangeFromS3()).resolves.toBeNull()
  })

  it('applies and strips the configured storage prefix', async () => {
    process.env.SITEMAP_S3_PREFIX = '/preview/'
    mockSend.mockResolvedValueOnce({
      Contents: [{ Key: 'preview/posts/2026/07/13/0.xml.gz/metadata.json' }],
    } as never)

    await expect(findTrackedDayRangeFromS3()).resolves.toEqual({
      earliestDay: '2026-07-13',
      latestDay: '2026-07-13',
    })
    expect((mockSend.mock.calls[0]![0] as ListObjectsV2Command).input).toMatchObject({
      Prefix: 'preview/posts/',
    })
  })
})
