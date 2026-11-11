import { randomUUID } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emulatorS3, putS3Object } from '@voucha/test-helpers/aws-emulator-s3'
import {
  clearS3ObjectDenials,
  denyS3ObjectActions,
  useOwnedS3Bucket,
} from '@voucha/test-helpers/s3-owned-bucket'
import { generateSitemapPage } from './generation-page.mts'
import type { GenerationPageDependencies } from './generation-page-types.mts'
import type { SitemapGenerationProgress } from './generation-storage.mts'
import { applyStoragePrefix } from './storage-prefix.mts'
import { getSitemapFamilyManifest, type PostDayManifest } from './storage.mts'
import type { SitemapFamilyEntry } from './types.mts'

describe('bounded sitemap publication', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
  it('keeps the previous index live across a cap and a failed staged upload', async () => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://test.com')
    vi.stubEnv('SITEMAP_S3_PREFIX', `generation-page-${randomUUID()}`)
    const bucket = await useOwnedS3Bucket('sitemaps')
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
    const previousManifest: PostDayManifest = {
      active_page_count: 1,
      generation_id: '11111111-1111-4111-8111-111111111111',
      generated_at: '2026-03-01T00:00:00.000Z',
      content_hash: 'previous-content',
    }
    const indexKey = applyStoragePrefix('sitemaps/families/topics.xml')
    await putS3Object({
      Bucket: bucket,
      Key: indexKey,
      Body: 'previous-index',
      Metadata: { 'sitemap-manifest': JSON.stringify(previousManifest) },
    })
    const readIndex = async () => {
      const object = await emulatorS3().send(
        new GetObjectCommand({ Bucket: bucket, Key: indexKey }),
      )
      return Buffer.from(await object.Body!.transformToByteArray())
    }
    const retired: Array<{ generationId: string; pageCount: number }> = []
    const dependencies: GenerationPageDependencies<SitemapFamilyEntry> = {
      getProgress: async () => progress,
      getManifest: () => getSitemapFamilyManifest('topics'),
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
      retireGeneration: async (generationId, pageCount) => {
        retired.push({ generationId, pageCount })
      },
      toUrl: entry => ({
        loc: `https://test.com${entry.path}`,
        lastmod: entry.updated_at.toISOString(),
      }),
    }
    await denyS3ObjectActions(bucket, [
      { action: 's3:PutObject', keys: [applyStoragePrefix('families/topics/*/2.xml')] },
    ])

    const first = await generateSitemapPage(1, dependencies)
    expect(first).toMatchObject({ manifest: null, hasMore: true })
    expect((await readIndex()).toString()).toBe('previous-index')
    expect((await getSitemapFamilyManifest('topics'))?.generation_id).toBe(
      '11111111-1111-4111-8111-111111111111',
    )
    const stagedGenerationId = currentProgress()?.generation_id

    await expect(generateSitemapPage(1, dependencies)).rejects.toMatchObject({
      name: 'AccessDenied',
    })
    expect((await readIndex()).toString()).toBe('previous-index')
    expect(currentProgress()?.page_count).toBe(1)

    await clearS3ObjectDenials(bucket)
    const final = await generateSitemapPage(1, dependencies)
    expect(final).toMatchObject({ hasMore: false, manifest: { active_page_count: 2 } })
    expect(gunzipSync(await readIndex()).toString()).toContain(
      `https://test.com/sitemaps/topics/${stagedGenerationId}/2.xml`,
    )
    expect(progress).toBeNull()

    const publishedIndex = await readIndex()
    const repaged = await generateSitemapPage(2, dependencies)
    expect(repaged.manifest).toEqual(final.manifest)
    expect(await readIndex()).toEqual(publishedIndex)
    expect(retired.at(-1)?.pageCount).toBe(1)
    expect(retired.at(-1)?.generationId).not.toBe(final.manifest?.generation_id)
  })
  it('no-ops a continuation whose generation is gone or replaced instead of starting one', async () => {
    let progress: SitemapGenerationProgress | null = null
    const started: SitemapGenerationProgress[] = []
    const dependencies: GenerationPageDependencies<SitemapFamilyEntry> = {
      getProgress: async () => progress,
      getManifest: async () => null,
      putProgress: async value => {
        started.push(value)
        progress = value
      },
      deleteProgress: async () => {
        progress = null
      },
      readPage: async () => [],
      pageStorageKey: (generationId, page) => `families/topics/${generationId}/${page}.xml`,
      pageRoutePath: (generationId, page) => `sitemaps/topics/${generationId}/${page}.xml`,
      indexStorageKey: 'sitemaps/families/topics.xml',
      retireGeneration: async () => {},
      toUrl: entry => ({ loc: `https://test.com${entry.path}`, lastmod: '2026-04-01' }),
    }

    // The chain's generation was published and its progress deleted.
    await expect(generateSitemapPage(1, dependencies, 'gone')).resolves.toMatchObject({
      hasMore: false,
      stale: true,
    })
    expect(started).toHaveLength(0)

    // A newer root-started generation replaced the one this continuation expects.
    progress = {
      generation_id: 'newer',
      started_at: new Date().toISOString(),
      content_hash: '',
      high_water_id: null,
      after_id: null,
      after_path: null,
      page_count: 0,
      finished: false,
      previous_generation_id: null,
      previous_page_count: 0,
    }
    await expect(generateSitemapPage(1, dependencies, 'older')).resolves.toMatchObject({
      stale: true,
    })
    expect(started).toHaveLength(0)
    expect(progress.generation_id).toBe('newer')
  })
})
