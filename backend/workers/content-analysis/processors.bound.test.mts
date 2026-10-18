import { describe, expect, it } from 'vitest'
import { createRandomString, insertLanguageDetectionUserForTest } from '@voucha/test-helpers'
import { languageDetectionWorkConfig } from '@services/language-detection/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processLanguageDetectionBackfill } from './processors.mts'

describe('bounded language backfill', () => {
  it('advances a retained backfill cursor one configured row at a time', async () => {
    const random = createRandomString(10)
    const ids = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
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
      const saved: string[] = []
      const first = await processLanguageDetectionBackfill(
        'backfill_users',
        ids,
        undefined,
        async id => {
          saved.push(id)
        },
      )
      expect(first).toEqual({ updated: 1, hasMore: true })
      expect(saved).toHaveLength(1)
      const second = await processLanguageDetectionBackfill(
        'backfill_users',
        ids,
        saved.at(-1),
        async id => {
          saved.push(id)
        },
      )
      expect(second).toEqual({ updated: 1, hasMore: true })
      expect(saved).toHaveLength(2)
      expect(new Set(saved).size).toBe(2)
    } finally {
      restoreLimits()
    }
  })
})
