import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
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
import {
  clearArticleMarkdownCacheForTests,
  getArticleMarkdown,
  listArticleMarkdownFiles,
} from './storage.mts'

describe('storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(S3ImagesClient.send).mockReset()
    clearArticleMarkdownCacheForTests()
  })

  describe('article S3 storage', () => {
    const mockSend = vi.mocked(S3ImagesClient.send)

    function s3Body(markdown: string): { transformToString: () => Promise<string> } {
      return { transformToString: vi.fn<VitestLooseMock>().mockResolvedValue(markdown) }
    }

    it('lists markdown files below the article prefix and skips nested files and README', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [
            {
              Key: 'articles/b.md',
              ETag: '"etag-b"',
              LastModified: new Date('2026-01-02T00:00:00Z'),
              Size: 2,
            },
            { Key: 'articles/README.md', ETag: '"readme"', Size: 1 },
            { Key: 'articles/nested/c.md', ETag: '"nested"', Size: 1 },
          ],
          NextContinuationToken: 'page-2',
        } as never)
        .mockResolvedValueOnce({
          Contents: [{ Key: 'articles/a.md', ETag: '"etag-a"', Size: 1 }],
        } as never)

      const files = await listArticleMarkdownFiles()

      expect(files.map(file => file.file)).toEqual(['a.md', 'b.md'])
      expect(files.map(file => file.key)).toEqual(['articles/a.md', 'articles/b.md'])
      expect(mockSend).toHaveBeenCalledTimes(2)

      const firstCommand = mockSend.mock.calls[0]![0] as ListObjectsV2Command
      const secondCommand = mockSend.mock.calls[1]![0] as ListObjectsV2Command
      expect(firstCommand.input).toMatchObject({
        Bucket: S3Buckets.assets,
        Prefix: 'articles/',
      })
      expect(secondCommand.input).toMatchObject({
        Bucket: S3Buckets.assets,
        Prefix: 'articles/',
        ContinuationToken: 'page-2',
      })
    })

    it('fetches article markdown from S3 and reuses the cache for the same token', async () => {
      mockSend.mockResolvedValueOnce({ Body: s3Body('# Cached\n'), ContentLength: 9 } as never)

      const article = { file: 'cached.md', key: 'articles/cached.md', cacheToken: '"v1"' }

      await expect(getArticleMarkdown(article)).resolves.toBe('# Cached\n')
      await expect(getArticleMarkdown(article)).resolves.toBe('# Cached\n')

      expect(mockSend).toHaveBeenCalledOnce()
      const command = mockSend.mock.calls[0]![0] as GetObjectCommand
      expect(command.input).toMatchObject({
        Bucket: S3Buckets.assets,
        Key: 'articles/cached.md',
      })
    })

    it('refetches article markdown when the object cache token changes', async () => {
      mockSend
        .mockResolvedValueOnce({ Body: s3Body('# First\n'), ContentLength: 8 } as never)
        .mockResolvedValueOnce({ Body: s3Body('# Second\n'), ContentLength: 9 } as never)

      await expect(
        getArticleMarkdown({ file: 'changed.md', key: 'articles/changed.md', cacheToken: '"v1"' }),
      ).resolves.toBe('# First\n')
      await expect(
        getArticleMarkdown({ file: 'changed.md', key: 'articles/changed.md', cacheToken: '"v2"' }),
      ).resolves.toBe('# Second\n')

      expect(mockSend).toHaveBeenCalledTimes(2)
    })

    it('rejects article objects that exceed the bounded read limit', async () => {
      const body = s3Body('# Large\n')
      mockSend.mockResolvedValueOnce({
        Body: body,
        ContentLength: 256 * 1024 + 1,
      } as never)

      await expect(
        getArticleMarkdown({ file: 'large.md', key: 'articles/large.md', cacheToken: '"large"' }),
      ).rejects.toThrow('Article object from S3 exceeds')
      expect(body.transformToString).not.toHaveBeenCalled()
    })
  })
})
