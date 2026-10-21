import { describe, expect, it } from 'vitest'
import { createRandomString, insertLanguageDetectionUserForTest } from '@voucha/test-helpers'
import { streamUsersNeedingLanguageDetection } from '../backfill.mts'

describe('language-detection user sweep UUIDv7 bound', () => {
  it.each([
    '2024-02-29T23:59:59.999Z',
    '2024-03-01T00:00:00.000Z',
    '2025-12-31T23:59:59.999Z',
    '2026-01-01T00:00:00.000Z',
    '2026-01-31T23:59:59.999Z',
    '2026-02-01T00:00:00.000Z',
  ])('includes the final UUIDv7 millisecond at %s', async sweepStartedAt => {
    const at = new Date(sweepStartedAt)
    const suffix = createRandomString(10)
    const beforeId = await insertLanguageDetectionUserForTest({
      username: `sweep-before-${suffix}`,
      markdown: 'Before the sweep bound',
      createdAt: new Date(at.getTime() - 1),
    })
    const atId = await insertLanguageDetectionUserForTest({
      username: `sweep-at-${suffix}`,
      markdown: 'At the sweep bound',
      createdAt: at,
    })
    const afterId = await insertLanguageDetectionUserForTest({
      username: `sweep-after-${suffix}`,
      markdown: 'After the sweep bound',
      createdAt: new Date(at.getTime() + 1),
    })

    const seen = new Set<string>()
    for await (const batch of streamUsersNeedingLanguageDetection(
      [beforeId, atId, afterId],
      undefined,
      3,
      sweepStartedAt,
    )) {
      for (const id of batch) seen.add(id)
    }
    expect(seen).toEqual(new Set([beforeId, atId]))
  })
})
