import { randomUUID } from 'node:crypto'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { S3Buckets } from '@modules/aws'
import { emulatorS3, putS3Object, readS3ObjectText } from '@voucha/test-helpers/aws-emulator-s3'
import {
  getTrackedDayRangeFromCache,
  setTrackedDayRangeCache,
  updateTrackedDayRangeCache,
} from './tracked-range-cache.mts'
import { applyStoragePrefix } from './storage-prefix.mts'
import { getTrackedDayRange, markTrackedDay } from './storage.mts'

const TRACKED_RANGE_STORAGE_KEY = 'sitemaps/meta/posts-tracked-range.json'

describe('tracked-range-cache', () => {
  let TRACKED_RANGE_CACHE_KEY: string
  beforeEach(() => {
    vi.stubEnv('SITEMAP_S3_PREFIX', `tracked-range-${randomUUID()}`)
    TRACKED_RANGE_CACHE_KEY = applyStoragePrefix('sitemaps:posts:tracked-range:v1')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await cacheValkeyClient.unlink([TRACKED_RANGE_CACHE_KEY])
    vi.unstubAllEnvs()
  })

  describe('tracked range cache', () => {
    it('leaves an absent range unchanged when no fallback is available', async () => {
      await expect(updateTrackedDayRangeCache('2026-05-10')).resolves.toBeNull()
      await expect(getTrackedDayRangeFromCache()).resolves.toBeNull()
    })

    it('keeps tracked ranges separate for each configured storage namespace', async () => {
      const firstPrefix = process.env.SITEMAP_S3_PREFIX!
      const firstRange = { earliestDay: '2026-05-01', latestDay: '2026-05-02' }
      await setTrackedDayRangeCache(firstRange)
      vi.stubEnv('SITEMAP_S3_PREFIX', `other-range-${randomUUID()}`)
      const otherKey = applyStoragePrefix('sitemaps:posts:tracked-range:v1')
      onTestFinished(async () => {
        await cacheValkeyClient.unlink([otherKey])
      })
      await expect(getTrackedDayRangeFromCache()).resolves.toBeNull()
      await updateTrackedDayRangeCache('2026-06-01', {
        earliestDay: '2026-06-01',
        latestDay: '2026-06-01',
      })
      vi.stubEnv('SITEMAP_S3_PREFIX', firstPrefix)
      await expect(getTrackedDayRangeFromCache()).resolves.toEqual(firstRange)
    })

    it('returns previous and next ranges from one atomic Lua update', async () => {
      const fallbackRange = { earliestDay: '2026-05-10', latestDay: '2026-05-10' }
      await expect(updateTrackedDayRangeCache('2026-05-08', fallbackRange)).resolves.toEqual({
        previousRange: { earliestDay: '2026-05-10', latestDay: '2026-05-10' },
        nextRange: { earliestDay: '2026-05-08', latestDay: '2026-05-10' },
      })
      await expect(updateTrackedDayRangeCache('2026-05-12')).resolves.toEqual({
        previousRange: { earliestDay: '2026-05-08', latestDay: '2026-05-10' },
        nextRange: { earliestDay: '2026-05-08', latestDay: '2026-05-12' },
      })

      await expect(getTrackedDayRangeFromCache()).resolves.toEqual({
        earliestDay: '2026-05-08',
        latestDay: '2026-05-12',
      })
    })

    it('marks an in-range day with one script request and no cache read', async () => {
      const currentRange = { earliestDay: '2026-05-08', latestDay: '2026-05-12' }
      await setTrackedDayRangeCache(currentRange)
      const getSpy = vi.spyOn(cacheValkeyClient, 'get')
      const scriptSpy = vi.spyOn(cacheValkeyClient, 'invokeScript')

      await expect(markTrackedDay('2026-05-10')).resolves.toEqual(currentRange)

      expectTrackedRangeRequests(getSpy.mock.calls, scriptSpy.mock.calls)
    })

    it('restores the merged durable tracked range to an empty cache', async () => {
      const persistedRange = { earliestDay: '2026-03-10', latestDay: '2026-05-20' }
      const durableRange = { earliestDay: '2026-01-02', latestDay: '2026-06-30' }
      await seedTrackedRangeStorage(persistedRange, ['2026-01-02', '2026-06-30'])

      await expect(getTrackedDayRange()).resolves.toEqual(durableRange)
      await expect(getTrackedDayRangeFromCache()).resolves.toEqual(durableRange)

      await expectPersistedTrackedRange(durableRange)
    })

    it('preserves the durable tracked range when marking a day from an empty cache', async () => {
      const persistedRange = { earliestDay: '2026-03-10', latestDay: '2026-05-20' }
      const durableRange = { earliestDay: '2026-01-02', latestDay: '2026-06-30' }
      await seedTrackedRangeStorage(persistedRange, ['2026-01-02', '2026-06-30'])

      await expect(markTrackedDay('2026-04-15')).resolves.toEqual(durableRange)
      await expect(getTrackedDayRangeFromCache()).resolves.toEqual(durableRange)

      await expectPersistedTrackedRange(durableRange)
    })
  })

  function expectTrackedRangeRequests(
    getCalls: ReadonlyArray<Parameters<typeof cacheValkeyClient.get>>,
    scriptCalls: ReadonlyArray<Parameters<typeof cacheValkeyClient.invokeScript>>,
  ): void {
    expect(getCalls.filter(([key]) => key === TRACKED_RANGE_CACHE_KEY)).toHaveLength(0)
    const trackedCalls = scriptCalls.filter(([, options]) =>
      options?.keys?.includes(TRACKED_RANGE_CACHE_KEY),
    )
    expect(trackedCalls).toHaveLength(1)
    expect(trackedCalls[0]![1]?.args).toEqual(['2026-05-10'])
  }

  async function seedTrackedRangeStorage(
    persistedRange: { earliestDay: string; latestDay: string },
    discoveredDays: readonly string[],
  ): Promise<void> {
    await Promise.all([
      putS3Object({
        Bucket: S3Buckets.sitemaps,
        Key: applyStoragePrefix(TRACKED_RANGE_STORAGE_KEY),
        Body: JSON.stringify(persistedRange),
      }),
      ...discoveredDays.map(day =>
        putS3Object({
          Bucket: S3Buckets.sitemaps,
          Key: applyStoragePrefix(`posts/${day.replaceAll('-', '/')}/article/index.xml`),
          Body: 'index',
        }),
      ),
    ])
  }

  async function expectPersistedTrackedRange(range: {
    earliestDay: string
    latestDay: string
  }): Promise<void> {
    const key = applyStoragePrefix(TRACKED_RANGE_STORAGE_KEY)
    expect(await readS3ObjectText(S3Buckets.sitemaps, key)).toBe(JSON.stringify(range))
    const head = await emulatorS3().send(
      new HeadObjectCommand({ Bucket: S3Buckets.sitemaps, Key: key }),
    )
    expect(head.ContentType).toBe('application/json; charset=utf-8')
  }
})
