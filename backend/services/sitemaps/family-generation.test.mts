import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { gunzipSync } from 'node:zlib'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { createTestUser, insertTestPost, setPostVotesScoreUp } from '@voucha/test-helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSitemapFamilyIndexEntry, generateSitemapFamilyFiles } from './family-generation.mts'
import { generateSitemapPage, type GenerationPageDependencies } from './generation-page.mts'
import type { SitemapGenerationProgress } from './generation-storage.mts'
import { generatePostDaySitemapFiles } from './generation.mts'
import type { PostDayManifest } from './storage.mts'
import type { SitemapFamilyEntry } from './types.mts'

describe('sitemap generation publication', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('keeps the published family index across a failed S3 page and retires it after replay', async () => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://example.com')
    const user = await createTestUser()
    const previousGenerationId = randomUUID()
    const manifestKey = 'families/users/_meta.json'
    const indexKey = 'sitemaps/families/users.xml'
    const objects = new Map<string, Buffer>([
      [
        manifestKey,
        Buffer.from(
          JSON.stringify({
            active_page_count: 1,
            generation_id: previousGenerationId,
            generated_at: '2026-01-01T00:00:00.000Z',
          }),
        ),
      ],
      [indexKey, Buffer.from('previous-public-index')],
    ])
    let failStagedPage = true
    spyOnSitemapObjectStore(objects, key =>
      /^families\/users\/[^/]+\/1\.xml$/u.test(key) && failStagedPage
        ? new Error('staged family page failed')
        : undefined,
    )

    await expect(generateSitemapFamilyFiles('users')).rejects.toThrow('staged family page failed')
    expect(objects.get(indexKey)?.toString()).toBe('previous-public-index')
    const failedProgress = JSON.parse(objects.get('families/users/_progress.json')!.toString()) as {
      generation_id: string
      page_count: number
    }
    expect(failedProgress.page_count).toBe(0)

    failStagedPage = false
    const result = await generateSitemapFamilyFiles('users')
    expect(result.hasMore).toBe(false)
    expect(result.manifest).toMatchObject({
      active_page_count: 1,
      generation_id: failedProgress.generation_id,
    })
    expect(objects.has('families/users/_progress.json')).toBe(false)
    expect(
      gunzipSync(objects.get(`families/users/${failedProgress.generation_id}/1.xml`)!).toString(),
    ).toContain(`/user/${user.username}`)
    expect(gunzipSync(objects.get(indexKey)!).toString()).toContain(
      `https://example.com/sitemaps/users/${failedProgress.generation_id}/1.xml`,
    )
    expect(
      JSON.parse(objects.get(`sitemaps/retired/records/${previousGenerationId}.json`)!.toString()),
    ).toMatchObject({ generation_id: previousGenerationId, page_count: 1, next_page: 1 })
  })

  it('stages an eligible post-day page without replacing the prior index when index upload fails', async () => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://example.com')
    const author = await createTestUser()
    const slug = `staged-sitemap-${randomUUID()}`
    const postId = await insertTestPost({
      title: 'Staged sitemap article',
      slug,
      markdown: 'A public article with an eligible vote.',
      createdById: author.id,
      postType: 'article',
      createdAt: new Date('2026-06-10T12:00:00.000Z'),
    })
    await setPostVotesScoreUp(postId, 1)
    const previousGenerationId = randomUUID()
    const indexKey = 'posts/2026/06/10/article/index.xml'
    const objects = new Map<string, Buffer>([
      [
        'posts/2026/06/10/article/_meta.json',
        Buffer.from(
          JSON.stringify({
            active_page_count: 1,
            generation_id: previousGenerationId,
            generated_at: '2026-06-09T00:00:00.000Z',
          }),
        ),
      ],
      [indexKey, Buffer.from('previous-public-index')],
    ])
    spyOnSitemapObjectStore(objects, key =>
      key === indexKey ? new Error('post-day index upload failed') : undefined,
    )

    await expect(generatePostDaySitemapFiles('article', '2026-06-10')).rejects.toThrow(
      'post-day index upload failed',
    )
    expect(objects.get(indexKey)?.toString()).toBe('previous-public-index')
    const progress = JSON.parse(
      objects.get('posts/2026/06/10/article/_progress.json')!.toString(),
    ) as {
      generation_id: string
      page_count: number
    }
    expect(progress.page_count).toBeGreaterThan(0)
    expect(
      gunzipSync(
        objects.get(`posts/2026/06/10/article/${progress.generation_id}/1.xml`)!,
      ).toString(),
    ).toContain(`https://example.com/article/${slug}`)
    expect(objects.has(`sitemaps/retired/records/${previousGenerationId}.json`)).toBe(false)
    expect(objects.has('sitemaps/meta/posts-tracked-range.json')).toBe(false)
  })

  it('keeps the previous index live across a cap and a failed staged upload', async () => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://test.com')
    const entries: SitemapFamilyEntry[] = [
      {
        id: '0199a000-0000-7000-8000-000000000003',
        path: '/first',
        updated_at: new Date('2026-04-01'),
      },
      {
        id: '0199a000-0000-7000-8000-000000000002',
        path: '/second',
        updated_at: new Date('2026-04-01'),
      },
    ]
    let progress: SitemapGenerationProgress | null = null
    const currentProgress = (): SitemapGenerationProgress | null => progress
    let manifest: PostDayManifest | null = {
      active_page_count: 1,
      generation_id: '11111111-1111-4111-8111-111111111111',
      generated_at: '2026-03-01T00:00:00.000Z',
    }
    const objects = new Map<string, string>([['sitemaps/families/topics.xml', 'previous-index']])
    let failNextPage = true
    const dependencies: GenerationPageDependencies<SitemapFamilyEntry> = {
      getProgress: async () => progress,
      getManifest: async () => manifest,
      putProgress: async value => {
        progress = value
      },
      deleteProgress: async () => {
        progress = null
      },
      readPage: async options => {
        const eligible = entries.filter(
          entry =>
            (!options.highWaterId || entry.id <= options.highWaterId) &&
            (!options.afterId ||
              entry.id < options.afterId ||
              (entry.id === options.afterId && entry.path > (options.afterPath ?? ''))),
        )
        return eligible.slice(0, options.limit)
      },
      pageStorageKey: (generationId, page) => `families/topics/${generationId}/${page}.xml`,
      pageRoutePath: (generationId, page) => `sitemaps/topics/${generationId}/${page}.xml`,
      indexStorageKey: 'sitemaps/families/topics.xml',
      putManifest: async value => {
        manifest = value
      },
      retireGeneration: async () => {},
      toUrl: entry => ({
        loc: `https://test.com${entry.path}`,
        lastmod: entry.updated_at.toISOString(),
      }),
      putObjectFile: async (key, filePath) => {
        if (key.endsWith('/2.xml') && failNextPage) throw new Error('staged upload failed')
        objects.set(key, gunzipSync(await readFile(filePath)).toString())
      },
    }

    const first = await generateSitemapPage(1, dependencies)
    expect(first).toMatchObject({ manifest: null, hasMore: true })
    expect(objects.get('sitemaps/families/topics.xml')).toBe('previous-index')
    expect(manifest?.generation_id).toBe('11111111-1111-4111-8111-111111111111')
    const stagedGenerationId = currentProgress()?.generation_id

    await expect(generateSitemapPage(1, dependencies)).rejects.toThrow('staged upload failed')
    expect(objects.get('sitemaps/families/topics.xml')).toBe('previous-index')
    expect(currentProgress()?.page_count).toBe(1)

    failNextPage = false
    const final = await generateSitemapPage(1, dependencies)
    expect(final).toMatchObject({ hasMore: false, manifest: { active_page_count: 2 } })
    expect(objects.get('sitemaps/families/topics.xml')).toContain(
      `https://test.com/sitemaps/topics/${stagedGenerationId}/2.xml`,
    )
    expect(progress).toBeNull()
  })

  it('builds root-index entries for family indexes', () => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://test.com')
    expect(buildSitemapFamilyIndexEntry('domains')).toEqual({
      loc: 'https://test.com/sitemaps/domains.xml',
    })
  })
})

function spyOnSitemapObjectStore(
  objects: Map<string, Buffer>,
  rejectPut: (key: string) => Error | undefined,
): void {
  vi.spyOn(S3Client.prototype, 'send').mockImplementation(async command => {
    if (command instanceof GetObjectCommand) {
      const body = objects.get(command.input.Key!)
      if (!body) throw Object.assign(new Error('missing object'), { name: 'NoSuchKey' })
      return { Body: { transformToString: async () => body.toString() } } as never
    }
    if (command instanceof PutObjectCommand) {
      const key = command.input.Key!
      const failure = rejectPut(key)
      if (failure) throw failure
      const body = command.input.Body
      const chunks: Buffer[] = []
      if (typeof body === 'string' || body instanceof Uint8Array) {
        chunks.push(Buffer.from(body))
      } else {
        for await (const chunk of body as Readable) chunks.push(Buffer.from(chunk))
      }
      const bytes = Buffer.concat(chunks)
      objects.set(key, bytes)
      return {} as never
    }
    if (command instanceof DeleteObjectCommand) {
      objects.delete(command.input.Key!)
      return {} as never
    }
    throw new Error(`Unexpected S3 command: ${command.constructor.name}`)
  })
}
