import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  setPostVotesScoreUp,
  withDominantPostFixtures,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { spyOnSitemapObjectStore } from '@voucha/test-helpers/sitemap-object-store'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { generatePostDaySitemapFiles } from './generation.mts'
import { generateSitemapFamilyFiles } from './family-generation.mts'
import { getSitemapFamilyManifest, type PostDayManifest } from './storage.mts'
import { sitemapsWorkConfig } from './work-limits.mts'
import type { SitemapGenerationProgress } from './generation-storage.mts'

describe('sitemap generation freshness', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('keeps all child URLs for an identical completed sitemap and retires only its staged candidate', async () => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://example.com')
    const year = 4000 + (Number.parseInt(randomUUID().slice(0, 4), 16) % 5000)
    const day = `${year}-06-12`
    await withDominantPostFixtures(
      [
        { postType: 'discussion', votesScoreUp: 1, createdAt: new Date(`${day}T12:00:00.000Z`) },
        { postType: 'discussion', votesScoreUp: 0, createdAt: new Date(`${day}T13:00:00.000Z`) },
      ],
      async postIds => {
        const objects = new Map<string, Buffer>()
        const metadata = new Map<string, PostDayManifest>()
        spyOnSitemapObjectStore(objects, () => undefined, metadata)
        const first = await generatePostDaySitemapFiles('discussion', day)
        expect(first.hasMore).toBe(false)
        const indexKey = `posts/${year}/06/12/discussion/index.xml`
        const publicIndex = objects.get(indexKey)
        const second = await generatePostDaySitemapFiles('discussion', day)
        expect(second.manifest).toEqual(first.manifest)
        expect(objects.get(indexKey)).toEqual(publicIndex)
        const retirementKeys = [...objects.keys()].filter(key =>
          key.startsWith('sitemaps/retired/records/'),
        )
        expect(retirementKeys).toHaveLength(1)
        expect(JSON.parse(objects.get(retirementKeys[0]!)!.toString()).generation_id).not.toBe(
          first.manifest?.generation_id,
        )
        expect(objects.has(`sitemaps/retired/records/${first.manifest?.generation_id}.json`)).toBe(
          false,
        )

        await setPostVotesScoreUp(postIds[1]!, 1)
        const changed = await generatePostDaySitemapFiles('discussion', day)
        expect(changed.manifest?.generation_id).not.toBe(first.manifest?.generation_id)
        expect(changed.manifest?.content_hash).not.toBe(first.manifest?.content_hash)
        expect(objects.has(`sitemaps/retired/records/${first.manifest?.generation_id}.json`)).toBe(
          true,
        )
      },
    )
  })

  it.each([
    { finished: false, startedAt: '2026-10-24T23:58:00.000Z' },
    { finished: true, startedAt: '2026-10-24T23:58:00.000Z' },
    { finished: false, startedAt: 'invalid' },
    { finished: true, startedAt: '2027-01-01T00:00:00.000Z' },
  ])(
    'restarts an expired or invalid candidate without retiring the public generation ($finished, $startedAt)',
    async ({ finished, startedAt }) => {
      onTestFinished(
        overrideDynamicConfigFieldsForTest(sitemapsWorkConfig, {
          generation_max_age_seconds: 60,
          generation_page_row_limit: 1,
        }),
      )
      vi.stubEnv('SITEMAP_BASE_URL', 'https://example.com')
      const user = await createTestUser()
      await createTestUser()
      const publicGeneration = randomUUID()
      const candidate = randomUUID()
      const indexKey = 'sitemaps/families/users.xml'
      const progressKey = 'families/users/_progress.json'
      const objects = new Map<string, Buffer>([
        [indexKey, Buffer.from('previous-public-index')],
        [
          progressKey,
          Buffer.from(
            JSON.stringify({
              generation_id: candidate,
              started_at: startedAt,
              content_hash: 'stale',
              high_water_id: '00000000-0000-7000-8000-000000000001',
              after_id: null,
              after_path: null,
              page_count: 1,
              finished,
              previous_generation_id: publicGeneration,
              previous_page_count: 1,
            } satisfies SitemapGenerationProgress),
          ),
        ],
      ])
      const metadata = new Map([
        [
          indexKey,
          {
            generation_id: publicGeneration,
            active_page_count: 1,
            generated_at: '2026-01-01T00:00:00.000Z',
            content_hash: 'public',
          },
        ],
      ])
      spyOnSitemapObjectStore(
        objects,
        key => (key === indexKey ? new Error('index unavailable') : undefined),
        metadata,
      )
      const restarted = await generateSitemapFamilyFiles(
        'users',
        new Date('2026-10-25T00:00:00.000Z'),
      )
      expect(restarted.hasMore).toBe(true)
      const fresh = JSON.parse(objects.get(progressKey)!.toString()) as SitemapGenerationProgress
      expect(fresh.generation_id).not.toBe(candidate)
      expect(fresh.high_water_id!.localeCompare(user.id)).toBeGreaterThanOrEqual(0)
      expect(fresh.started_at).toBe('2026-10-25T00:00:00.000Z')
      expect(objects.get(indexKey)?.toString()).toBe('previous-public-index')
      expect((await getSitemapFamilyManifest('users'))?.generation_id).toBe(publicGeneration)
      expect(
        JSON.parse(objects.get(`sitemaps/retired/records/${candidate}.json`)!.toString()),
      ).toMatchObject({ page_count: finished ? 1 : 2 })
      expect(objects.has(`sitemaps/retired/records/${publicGeneration}.json`)).toBe(false)
    },
  )

  it('recognizes an index committed before progress deletion failed and retains it through an expired rebuild', async () => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://example.com')
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sitemapsWorkConfig, { generation_page_row_limit: 1 }),
    )
    const generationId = randomUUID()
    const progressKey = 'families/users/_progress.json'
    const completed: SitemapGenerationProgress = {
      generation_id: generationId,
      started_at: '2026-10-25T00:00:00.000Z',
      content_hash: 'completed',
      high_water_id: null,
      after_id: null,
      after_path: null,
      page_count: 1,
      finished: true,
      previous_generation_id: null,
      previous_page_count: 0,
    }
    const objects = new Map<string, Buffer>([[progressKey, Buffer.from(JSON.stringify(completed))]])
    const metadata = new Map<string, PostDayManifest>()
    spyOnSitemapObjectStore(
      objects,
      () => undefined,
      metadata,
      key => (key === progressKey ? new Error('progress deletion failed') : undefined),
    )
    await expect(
      generateSitemapFamilyFiles('users', new Date('2026-10-25T00:00:00.000Z')),
    ).rejects.toThrow('progress deletion failed')
    const published = await getSitemapFamilyManifest('users')
    expect(published!.generation_id).toBe(generationId)
    const indexKey = 'sitemaps/families/users.xml'
    const committedProgress = JSON.parse(
      objects.get(progressKey)!.toString(),
    ) as SitemapGenerationProgress
    expect(committedProgress.finished).toBe(true)
    expect(committedProgress.generation_id).toBe(generationId)
    objects.set(
      progressKey,
      Buffer.from(JSON.stringify({ ...committedProgress, started_at: '2026-01-01T00:00:00.000Z' })),
    )
    const user = await createTestUser()
    await createTestUser()
    spyOnSitemapObjectStore(
      objects,
      key => (key === indexKey ? new Error('fresh index unavailable') : undefined),
      metadata,
    )
    const restarted = await generateSitemapFamilyFiles(
      'users',
      new Date('2026-10-25T00:00:00.000Z'),
    )
    expect(restarted.hasMore).toBe(true)
    const fresh = JSON.parse(objects.get(progressKey)!.toString()) as SitemapGenerationProgress
    expect(fresh.generation_id).not.toBe(generationId)
    expect(fresh.high_water_id!.localeCompare(user.id)).toBeGreaterThanOrEqual(0)
    expect(fresh.previous_generation_id).toBe(generationId)
    expect((await getSitemapFamilyManifest('users'))?.generation_id).toBe(generationId)
    expect(objects.has(`sitemaps/retired/records/${generationId}.json`)).toBe(false)
  })
})
