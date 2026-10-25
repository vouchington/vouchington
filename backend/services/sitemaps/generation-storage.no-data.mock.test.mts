import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { S3Buckets } from '@modules/aws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deletePostDayProgress,
  deleteRetiredSitemapGeneration,
  deleteSitemapFamilyProgress,
  deleteSitemapObjects,
  getPostDayProgress,
  getRetiredSitemapCursor,
  getRetiredSitemapGeneration,
  getSitemapFamilyProgress,
  listRetiredSitemapGenerationKeys,
  putPostDayProgress,
  putRetiredSitemapCursor,
  putRetiredSitemapGeneration,
  putSitemapFamilyProgress,
  type SitemapGenerationProgress,
} from './generation-storage.mts'
import { cleanupRetiredSitemapGenerations } from './retired-generation-cleanup.mts'

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

  it('rejects an escaped retirement listing and invalid page sizes before advancing the cursor', async () => {
    await expect(listRetiredSitemapGenerationKeys(null, 0)).rejects.toThrow(
      'Invalid sitemap retirement listing limit',
    )
    await expect(listRetiredSitemapGenerationKeys(null, 1001)).rejects.toThrow(
      'Invalid sitemap retirement listing limit',
    )
    expect(mocks.send).not.toHaveBeenCalled()

    mocks.send.mockResolvedValueOnce({
      Contents: [{ Key: 'sitemaps/active/index.xml' }],
      IsTruncated: true,
    } as never)
    await expect(listRetiredSitemapGenerationKeys(null, 1)).rejects.toThrow(
      'Sitemap retirement listing escaped its prefix',
    )
    expect((mocks.send.mock.calls[0]![0] as ListObjectsV2Command).input).toMatchObject({
      Prefix: 'sitemaps/retired/records/',
      MaxKeys: 1,
    })
  })

  it('skips an empty batch and deletes only requested prefixed pages', async () => {
    vi.stubEnv('SITEMAP_S3_PREFIX', 'staging')
    await deleteSitemapObjects([])
    expect(mocks.send).not.toHaveBeenCalled()

    mocks.send.mockResolvedValueOnce({} as never)
    await deleteSitemapObjects([
      'families/topics/generation/1.xml',
      'families/topics/generation/2.xml',
    ])
    expect((mocks.send.mock.calls[0]![0] as DeleteObjectsCommand).input).toMatchObject({
      Bucket: S3Buckets.sitemaps,
      Delete: {
        Objects: [
          { Key: 'staging/families/topics/generation/1.xml' },
          { Key: 'staging/families/topics/generation/2.xml' },
        ],
      },
    })
  })

  it('advances past an absent retired record without deleting any page', async () => {
    const recordKey = 'sitemaps/retired/records/11111111-1111-4111-8111-111111111111.json'
    let savedCursor: string | undefined
    mocks.send.mockImplementation(async command => {
      if (command instanceof GetObjectCommand) {
        throw Object.assign(new Error('missing object'), { name: 'NoSuchKey' })
      }
      if (command instanceof ListObjectsV2Command) {
        return { Contents: [{ Key: recordKey }], IsTruncated: true } as never
      }
      if (command instanceof PutObjectCommand) {
        if (typeof command.input.Body !== 'string') throw new Error('Expected JSON cursor')
        savedCursor = command.input.Body
        return {} as never
      }
      throw new Error(`Unexpected S3 command: ${command.constructor.name}`)
    })

    await expect(
      cleanupRetiredSitemapGenerations(new Date('2026-10-25T00:00:00.000Z')),
    ).resolves.toEqual({
      deletedPages: 0,
      hasMore: true,
    })
    expect(savedCursor).toBe(JSON.stringify({ after_key: recordKey }))
    expect(mocks.send.mock.calls.some(([command]) => command instanceof DeleteObjectsCommand)).toBe(
      false,
    )
  })

  it('persists and removes bounded generation progress and retirement checkpoints', async () => {
    const objects = new Map<string, string>()
    mocks.send.mockImplementation(async command => {
      if (command instanceof PutObjectCommand) {
        if (typeof command.input.Body !== 'string') throw new Error('Expected JSON body')
        objects.set(command.input.Key!, command.input.Body)
        return {} as never
      }
      if (command instanceof GetObjectCommand) {
        const body = objects.get(command.input.Key!)
        if (body === undefined)
          throw Object.assign(new Error('missing object'), { name: 'NoSuchKey' })
        return { Body: { transformToString: async () => body } } as never
      }
      if (command instanceof DeleteObjectCommand) {
        objects.delete(command.input.Key!)
        return {} as never
      }
      throw new Error(`Unexpected S3 command: ${command.constructor.name}`)
    })
    const progress: SitemapGenerationProgress = {
      generation_id: '11111111-1111-4111-8111-111111111111',
      started_at: '2026-10-25T00:00:00.000Z',
      content_hash: '',
      high_water_id: '22222222-2222-4222-8222-222222222222',
      after_id: null,
      after_path: null,
      page_count: 1,
      finished: false,
      previous_generation_id: null,
      previous_page_count: 0,
    }
    await putPostDayProgress('article', '2026-06-10', progress)
    await putSitemapFamilyProgress('topics', progress)
    await putRetiredSitemapGeneration({
      generation_id: progress.generation_id,
      page_prefix: 'families/topics/old/',
      page_count: 3,
      next_page: 2,
      retire_after: '2026-07-01T00:00:00.000Z',
    })
    await putRetiredSitemapCursor('sitemaps/retired/records/previous.json')

    expect(await getPostDayProgress('article', '2026-06-10')).toEqual(progress)
    expect(await getSitemapFamilyProgress('topics')).toEqual(progress)
    expect(
      await getRetiredSitemapGeneration(`sitemaps/retired/records/${progress.generation_id}.json`),
    ).toMatchObject({ next_page: 2, page_count: 3 })
    expect(await getRetiredSitemapCursor()).toBe('sitemaps/retired/records/previous.json')
    expect(() => getRetiredSitemapGeneration('sitemaps/active/index.xml')).toThrow(
      'Invalid sitemap retirement key',
    )
    expect(() => deleteRetiredSitemapGeneration('sitemaps/active/index.xml')).toThrow(
      'Invalid sitemap retirement key',
    )

    await deletePostDayProgress('article', '2026-06-10')
    await deleteSitemapFamilyProgress('topics')
    await deleteRetiredSitemapGeneration(`sitemaps/retired/records/${progress.generation_id}.json`)
    await putRetiredSitemapCursor(null)
    expect(await getPostDayProgress('article', '2026-06-10')).toBeNull()
    expect(await getSitemapFamilyProgress('topics')).toBeNull()
    expect(await getRetiredSitemapCursor()).toBeNull()
    expect([...objects.keys()]).toEqual(['sitemaps/retired/_cursor.json'])
  })
})
