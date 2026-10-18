import { describe, expect, it } from 'vitest'
import { createRandomString, insertLanguageDetectionUserForTest } from '@voucha/test-helpers'
import { languageDetectionWorkConfig } from '@services/language-detection/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processLanguageDetectionBackfill } from './processors.mts'

describe('bounded language backfill', () => {
  it('finishes a retained sweep before considering rows created after its UUIDv7 fence', async () => {
    const random = createRandomString(10)
    const ids = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        insertLanguageDetectionUserForTest({
          username: `language-page-${random}-${index}`,
          markdown:
            'This profile contains English sentences for a bounded language detection pass.',
        }),
      ),
    )
    const restoreLimits = overrideDynamicConfigFieldsForTest(languageDetectionWorkConfig, {
      backfill_max_rows_per_run: 1,
      backfill_batch_size: 1,
    })
    try {
      const saved: Array<{ sweepStartedAt: string; afterId?: string }> = []
      const first = await processLanguageDetectionBackfill(
        'backfill_users',
        ids,
        undefined,
        async cursor => {
          saved.push({ ...cursor })
        },
      )
      expect(first).toEqual({ updated: 1, hasMore: true })
      expect(saved).toHaveLength(2)
      expect(saved[0]).toEqual({ sweepStartedAt: expect.any(String) })

      const futureCreatedAt = new Date(Date.parse(saved[0]!.sweepStartedAt) + 1_000)
      const laterId = await insertLanguageDetectionUserForTest({
        username: `language-page-${random}-later`,
        markdown:
          'This later profile contains English sentences for a bounded language detection pass.',
        createdAt: futureCreatedAt,
      })
      expect(futureCreatedAt.getTime()).toBeGreaterThan(Date.parse(saved[0]!.sweepStartedAt))
      expect(ids.every(id => id < laterId)).toBe(true)

      const scope = [...ids, laterId]
      const second = await processLanguageDetectionBackfill(
        'backfill_users',
        scope,
        saved.at(-1),
        async cursor => {
          saved.push({ ...cursor })
        },
      )
      expect(second).toEqual({ updated: 1, hasMore: true })
      expect(saved).toHaveLength(3)
      expect(saved[2]?.sweepStartedAt).toBe(saved[0]?.sweepStartedAt)
      expect(new Set(saved.map(cursor => cursor.afterId).filter(Boolean)).size).toBe(2)

      const completed = await processLanguageDetectionBackfill(
        'backfill_users',
        scope,
        saved.at(-1),
      )
      expect(completed).toEqual({ updated: 0, hasMore: false })

      const fresh = await processLanguageDetectionBackfill('backfill_users', [laterId], {
        sweepStartedAt: new Date(futureCreatedAt.getTime() + 1_000).toISOString(),
      })
      expect(fresh).toEqual({ updated: 1, hasMore: true })
    } finally {
      restoreLimits()
    }
  })
})
