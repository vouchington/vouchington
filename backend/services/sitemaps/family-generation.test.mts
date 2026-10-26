import { spyOnSitemapObjectStore } from '@voucha/test-helpers/sitemap-object-store'
import { randomUUID } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import {
  createTestUser,
  insertTestPost,
  setPostVotesScoreUp,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { buildSitemapFamilyIndexEntry, generateSitemapFamilyFiles } from './family-generation.mts'
import { generatePostDaySitemapFiles } from './generation.mts'
import { getPostDayManifest } from './storage.mts'
import { sitemapsWorkConfig } from './work-limits.mts'
import type { SitemapGenerationProgress } from './generation-storage.mts'

describe('sitemap generation publication', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('keeps the published family index across a failed S3 page and retires it after replay', async () => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://example.com')
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sitemapsWorkConfig, { generation_page_row_limit: 1 }),
    )
    await createTestUser()
    const user = await createTestUser()
    const candidateId = randomUUID()
    const previousGenerationId = randomUUID()
    const indexKey = 'sitemaps/families/users.xml'
    const objects = new Map<string, Buffer>([[indexKey, Buffer.from('previous-public-index')]])
    objects.set(
      'families/users/_progress.json',
      Buffer.from(
        JSON.stringify({
          generation_id: candidateId,
          started_at: new Date().toISOString(),
          content_hash: '',
          high_water_id: user.id,
          after_id: null,
          after_path: null,
          page_count: 0,
          finished: false,
          previous_generation_id: previousGenerationId,
          previous_page_count: 1,
        } satisfies SitemapGenerationProgress),
      ),
    )
    const metadata = new Map([
      [
        indexKey,
        {
          active_page_count: 1,
          generation_id: previousGenerationId,
          generated_at: '2026-01-01T00:00:00.000Z',
          content_hash: 'previous-content',
        },
      ],
    ])
    let failStagedPage = true
    spyOnSitemapObjectStore(
      objects,
      key =>
        /^families\/users\/[^/]+\/1\.xml$/u.test(key) && failStagedPage
          ? new Error('staged family page failed')
          : undefined,
      metadata,
    )

    await expect(generateSitemapFamilyFiles('users')).rejects.toThrow('staged family page failed')
    expect(objects.get(indexKey)?.toString()).toBe('previous-public-index')
    const failedProgress = JSON.parse(objects.get('families/users/_progress.json')!.toString()) as {
      generation_id: string
      page_count: number
    }
    expect(failedProgress.page_count).toBe(0)

    failStagedPage = false
    const resumed = await generateSitemapFamilyFiles('users')
    expect(resumed.hasMore).toBe(true)
    expect(objects.get(indexKey)?.toString()).toBe('previous-public-index')
    expect(gunzipSync(objects.get(`families/users/${candidateId}/1.xml`)!).toString()).toContain(
      `/user/${user.username}`,
    )
    // Finalization resumes a completed checkpoint, independently of unrelated users.
    const completed = JSON.parse(
      objects.get('families/users/_progress.json')!.toString(),
    ) as SitemapGenerationProgress
    objects.set(
      'families/users/_progress.json',
      Buffer.from(JSON.stringify({ ...completed, finished: true })),
    )
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
    const objects = new Map<string, Buffer>([[indexKey, Buffer.from('previous-public-index')]])
    const metadata = new Map([
      [
        indexKey,
        {
          active_page_count: 1,
          generation_id: previousGenerationId,
          generated_at: '2026-06-09T00:00:00.000Z',
          content_hash: 'previous-content',
        },
      ],
    ])
    spyOnSitemapObjectStore(
      objects,
      key => (key === indexKey ? new Error('post-day index upload failed') : undefined),
      metadata,
    )

    await expect(generatePostDaySitemapFiles('article', '2026-06-10')).rejects.toThrow(
      'post-day index upload failed',
    )
    expect(objects.get(indexKey)?.toString()).toBe('previous-public-index')
    expect((await getPostDayManifest('article', '2026-06-10'))?.generation_id).toBe(
      previousGenerationId,
    )
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

  it('builds root-index entries for family indexes', () => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://test.com')
    expect(buildSitemapFamilyIndexEntry('domains')).toEqual({
      loc: 'https://test.com/sitemaps/domains.xml',
    })
  })
})
