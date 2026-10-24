import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { S3Buckets } from '@modules/aws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteSitemapObjects, listRetiredSitemapGenerationKeys } from './generation-storage.mts'

const mocks = vi.hoisted(() => ({
  send: vi.fn<typeof import('@aws-sdk/client-s3').S3Client.prototype.send>(),
}))

vi.mock<typeof import('@aws-sdk/client-s3')>(import('@aws-sdk/client-s3'), async importOriginal => {
  const sdk = await importOriginal()
  vi.spyOn(sdk.S3Client.prototype, 'send').mockImplementation(mocks.send)
  return sdk
})

describe('retired sitemap S3 operations', () => {
  afterEach(() => {
    mocks.send.mockReset()
    vi.unstubAllEnvs()
  })

  it('lists only the configured record page within the worktree prefix', async () => {
    vi.stubEnv('SITEMAP_S3_PREFIX', 'staging')
    mocks.send.mockResolvedValueOnce({
      Contents: [{ Key: 'staging/sitemaps/retired/records/gen.json' }],
      IsTruncated: true,
    } as never)

    await expect(
      listRetiredSitemapGenerationKeys('sitemaps/retired/records/prev.json', 2),
    ).resolves.toEqual({ keys: ['sitemaps/retired/records/gen.json'], hasMore: true })
    expect(mocks.send).toHaveBeenCalledOnce()
    expect((mocks.send.mock.calls[0]![0] as ListObjectsV2Command).input).toMatchObject({
      Bucket: S3Buckets.sitemaps,
      Prefix: 'staging/sitemaps/retired/records/',
      StartAfter: 'staging/sitemaps/retired/records/prev.json',
      MaxKeys: 2,
    })
  })

  it('does not acknowledge a partial S3 deletion', async () => {
    mocks.send.mockResolvedValueOnce({
      Errors: [{ Key: 'page.xml', Code: 'AccessDenied' }],
    } as never)
    await expect(deleteSitemapObjects(['families/topics/gen/1.xml'])).rejects.toThrow(
      'Sitemap object deletion was incomplete',
    )
    expect((mocks.send.mock.calls[0]![0] as DeleteObjectsCommand).input).toMatchObject({
      Bucket: S3Buckets.sitemaps,
      Delete: { Objects: [{ Key: 'families/topics/gen/1.xml' }] },
    })
  })
})
