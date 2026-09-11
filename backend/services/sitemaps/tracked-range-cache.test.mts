import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheValkeyClient } from '@data-stores/valkey'
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

      expect(getSpy).not.toHaveBeenCalled()
      expect(scriptSpy).toHaveBeenCalledOnce()
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
