import { randomUUID } from 'node:crypto'
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import { S3Buckets } from '@modules/aws'
import {
  getTrackedDayRangeFromCache,
  setTrackedDayRangeCache,
  updateTrackedDayRangeCache,
} from './tracked-range-cache.mts'
import { getTrackedDayRange, markTrackedDay } from './storage.mts'

describe('tracked-range-cache', () => {
  const TRACKED_RANGE_CACHE_KEY = 'sitemaps:posts:tracked-range:v1'

  afterEach(async () => {
    vi.restoreAllMocks()
    await cacheValkeyClient.unlink([TRACKED_RANGE_CACHE_KEY])
  })

  describe('tracked range cache', () => {
    it('leaves an absent range unchanged when no fallback is available', async () => {
      await expect(updateTrackedDayRangeCache('2026-05-10')).resolves.toBeNull()
      await expect(getTrackedDayRangeFromCache()).resolves.toBeNull()
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

    it('ignores other cache keys but rejects a second tracked-range script request', async () => {
      const currentRange = { earliestDay: '2026-05-08', latestDay: '2026-05-12' }
      const unrelatedKey = `sitemap-request-control:${randomUUID()}`
      onTestFinished(async () => {
        await cacheValkeyClient.unlink([unrelatedKey])
      })
      const script = registerScript(loadScript('upsert-tracked-day-range.lua', import.meta.url))
      await setTrackedDayRangeCache(currentRange)
      const getSpy = vi.spyOn(cacheValkeyClient, 'get')
      const scriptSpy = vi.spyOn(cacheValkeyClient, 'invokeScript')

      await cacheValkeyClient.invokeScript(script, {
        keys: [unrelatedKey],
        args: ['2026-05-10', JSON.stringify(currentRange)],
      })
      const unrelatedRange = await cacheValkeyClient.get(unrelatedKey)
      expect(JSON.parse(String(unrelatedRange))).toEqual(currentRange)
      await expect(markTrackedDay('2026-05-10')).resolves.toEqual(currentRange)
      expectTrackedRangeRequests(getSpy.mock.calls, scriptSpy.mock.calls)

      await expect(markTrackedDay('2026-05-10')).resolves.toEqual(currentRange)
      expect(() => expectTrackedRangeRequests(getSpy.mock.calls, scriptSpy.mock.calls)).toThrow(
        /length of 1/,
      )
    })

    it('restores the merged durable tracked range to an empty cache', async () => {
      const persistedRange = { earliestDay: '2026-03-10', latestDay: '2026-05-20' }
      const durableRange = { earliestDay: '2026-01-02', latestDay: '2026-06-30' }
      const sendSpy = mockTrackedRangeStorage(persistedRange, ['2026-01-02', '2026-06-30'])

      await expect(getTrackedDayRange()).resolves.toEqual(durableRange)
      await expect(getTrackedDayRangeFromCache()).resolves.toEqual(durableRange)

      expectTrackedRangeStorageUnion(sendSpy.mock.calls, durableRange)
    })

    it('preserves the durable tracked range when marking a day from an empty cache', async () => {
      const persistedRange = { earliestDay: '2026-03-10', latestDay: '2026-05-20' }
      const durableRange = { earliestDay: '2026-01-02', latestDay: '2026-06-30' }
      const sendSpy = mockTrackedRangeStorage(persistedRange, ['2026-01-02', '2026-06-30'])

      await expect(markTrackedDay('2026-04-15')).resolves.toEqual(durableRange)
      await expect(getTrackedDayRangeFromCache()).resolves.toEqual(durableRange)

      expectTrackedRangeStorageUnion(sendSpy.mock.calls, durableRange)
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

  function mockTrackedRangeStorage(
    persistedRange: { earliestDay: string; latestDay: string },
    discoveredDays: readonly string[],
  ) {
    return vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({
        Body: {
          transformToString: vi
            .fn<VitestLooseMock>()
            .mockResolvedValue(JSON.stringify(persistedRange)),
        },
      } as never)
      .mockResolvedValueOnce({
        Contents: discoveredDays.map(day => {
          const [year, month, date] = day.split('-')
          return { Key: `posts/${year}/${month}/${date}/article/metadata.json` }
        }),
      } as never)
      .mockResolvedValueOnce({} as never)
  }

  function expectTrackedRangeStorageUnion(
    calls: readonly (readonly unknown[])[],
    range: { earliestDay: string; latestDay: string },
  ): void {
    expect(calls).toHaveLength(3)
    expect(calls[0]![0]).toBeInstanceOf(GetObjectCommand)
    expect(calls[1]![0]).toBeInstanceOf(ListObjectsV2Command)
    expect((calls[2]![0] as PutObjectCommand).input).toMatchObject({
      Bucket: S3Buckets.sitemaps,
      Key: 'sitemaps/meta/posts-tracked-range.json',
      Body: JSON.stringify(range),
      ContentType: 'application/json; charset=utf-8',
    })
  }
})
