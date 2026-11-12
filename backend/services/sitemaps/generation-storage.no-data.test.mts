import { randomUUID } from 'node:crypto'
import { S3Client } from '@aws-sdk/client-s3'
import { S3Buckets } from '@modules/aws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listS3Keys,
  putS3Object,
  readS3ObjectText,
  s3ObjectExists,
} from '@voucha/test-helpers/aws-emulator-s3'
import { denyS3ObjectActions, useOwnedS3Bucket } from '@voucha/test-helpers/s3-owned-bucket'
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

/** A storage prefix owned by this test; fixed sitemap paths then cannot collide across forks. */
function ownedPrefix(): string {
  const prefix = `sitemap-generation-storage-${randomUUID()}/`
  vi.stubEnv('SITEMAP_S3_PREFIX', prefix)
  return prefix
}

function seed(prefix: string, key: string, body = 'page'): Promise<unknown> {
  return putS3Object({
    Bucket: S3Buckets.sitemaps,
    Key: `${prefix}${key}`,
    Body: body,
    ContentLength: Buffer.byteLength(body),
  })
}

describe('retired sitemap S3 operations', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('lists only the configured record page within the worktree prefix', async () => {
    const prefix = ownedPrefix()
    const records = 'sitemaps/retired/records/'
    await Promise.all(
      ['a.json', 'prev.json', 'q1.json', 'q2.json', 'q3.json'].map(file =>
        seed(prefix, `${records}${file}`),
      ),
    )
    await seed(prefix, 'sitemaps/retired/_cursor.json')
    await seed(prefix, 'sitemaps/active/index.xml')

    await expect(listRetiredSitemapGenerationKeys(`${records}prev.json`, 2)).resolves.toEqual({
      keys: [`${records}q1.json`, `${records}q2.json`],
      hasMore: true,
    })
    await expect(listRetiredSitemapGenerationKeys(`${records}q2.json`, 2)).resolves.toEqual({
      keys: [`${records}q3.json`],
      hasMore: false,
    })
  })

  it('does not acknowledge a partial S3 deletion', async () => {
    const prefix = ownedPrefix()
    const bucket = await useOwnedS3Bucket('sitemaps')
    const keys = ['families/topics/gen/1.xml', 'families/topics/gen/2.xml']
    await Promise.all(
      keys.map(key => putS3Object({ Bucket: bucket, Key: `${prefix}${key}`, Body: 'page' })),
    )
    await denyS3ObjectActions(bucket, [
      { action: 's3:DeleteObject', keys: [`${prefix}${keys[0]}`] },
    ])

    await expect(deleteSitemapObjects(keys)).rejects.toThrow(
      'Sitemap object deletion was incomplete',
    )
    expect(await listS3Keys(bucket, prefix)).toEqual([`${prefix}${keys[0]}`])
  })

  it('rejects invalid retirement page sizes before listing', async () => {
    await expect(listRetiredSitemapGenerationKeys(null, 0)).rejects.toThrow(
      'Invalid sitemap retirement listing limit',
    )
    await expect(listRetiredSitemapGenerationKeys(null, 1001)).rejects.toThrow(
      'Invalid sitemap retirement listing limit',
    )
  })

  // S3 honors the listing prefix, so only an injected response can return a key outside it.
  it('rejects an escaped retirement listing before advancing the cursor', async () => {
    ownedPrefix()
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({
      Contents: [{ Key: 'sitemaps/active/index.xml' }],
      IsTruncated: true,
    } as never)

    await expect(listRetiredSitemapGenerationKeys(null, 1)).rejects.toThrow(
      'Sitemap retirement listing escaped its prefix',
    )
  })

  it('skips an empty batch and deletes only requested prefixed pages', async () => {
    const prefix = ownedPrefix()
    const pages = [1, 2, 3].map(page => `families/topics/generation/${page}.xml`)
    await Promise.all(pages.map(page => seed(prefix, page)))

    await deleteSitemapObjects([])
    expect(await listS3Keys(S3Buckets.sitemaps, prefix)).toHaveLength(3)

    await deleteSitemapObjects(pages.slice(0, 2))
    expect(await listS3Keys(S3Buckets.sitemaps, prefix)).toEqual([`${prefix}${pages[2]}`])
  })

  it('advances past an absent retired record without deleting any page', async () => {
    const prefix = ownedPrefix()
    const recordKey = 'sitemaps/retired/records/11111111-1111-4111-8111-111111111111.json'
    // An empty record object reads as absent, like one removed after it was listed.
    await seed(prefix, recordKey, '')

    await expect(
      cleanupRetiredSitemapGenerations(new Date('2026-10-25T00:00:00.000Z')),
    ).resolves.toEqual({ deletedPages: 0, hasMore: false, resumeToken: `${recordKey}|` })
    expect(await s3ObjectExists(S3Buckets.sitemaps, `${prefix}${recordKey}`)).toBe(true)
    expect(
      await readS3ObjectText(S3Buckets.sitemaps, `${prefix}sitemaps/retired/_cursor.json`),
    ).toBe(JSON.stringify({ after_key: null }))
  })

  it('persists and removes bounded generation progress and retirement checkpoints', async () => {
    const prefix = ownedPrefix()
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
    expect(await listS3Keys(S3Buckets.sitemaps, prefix)).toEqual([
      `${prefix}sitemaps/retired/_cursor.json`,
    ])
  })
})
