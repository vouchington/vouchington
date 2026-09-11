import { describe, expect, it, vi } from 'vitest'
import {
  commentSeedTimestampMs,
  seedUuid,
  seedUuidAtTimestamp,
  seedRelationIdAfterPost,
} from './common.mts'

const UUIDV7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function timestampMsOf(uuid: string): number {
  return Number.parseInt(uuid.slice(0, 8) + uuid.slice(9, 13), 16)
}

describe('seedUuid', () => {
  it('spreads post (tag 05) timestamps one minute apart per index, most recent first', () => {
    const first = seedUuid(0, '05')
    const second = seedUuid(1, '05')
    const tenth = seedUuid(9, '05')

    expect(first).toMatch(UUIDV7_PATTERN)
    expect(second).toMatch(UUIDV7_PATTERN)
    expect(timestampMsOf(first) - timestampMsOf(second)).toBe(60_000)
    expect(timestampMsOf(first) - timestampMsOf(tenth)).toBe(9 * 60_000)
  })

  it('keeps every post id unique across a seeded range', () => {
    const ids = new Set(Array.from({ length: 500 }, (_, index) => seedUuid(index, '05')))
    expect(ids.size).toBe(500)
  })

  it('leaves every non-post tag on the fixed SEED_PREFIX instant', () => {
    expect(seedUuid(0, '01')).toBe('019e0000-0100-7000-8000-000000000000')
    expect(seedUuid(42, '01')).toBe('019e0000-0100-7000-8000-00000000002a')
  })

  it('keeps a post id stable across calls even as the system clock advances', () => {
    const before = seedUuid(7, '05')
    vi.useFakeTimers()
    try {
      vi.advanceTimersByTime(60_000)
      const after = seedUuid(7, '05')
      expect(after).toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('derives the same post id whether the process starts early or late in the same UTC calendar day', async () => {
    // seed.mts and run.mts are separate `node` process invocations in CI: this module's
    // day-anchor is captured once at import time in each. vi.resetModules() + a dynamic import
    // forces a genuinely fresh module evaluation, simulating that cross-process boundary.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-03-05T00:05:00.000Z'))
      vi.resetModules()
      const early = await import('./common.mts')

      vi.setSystemTime(new Date('2026-03-05T23:50:00.000Z'))
      vi.resetModules()
      const late = await import('./common.mts')

      expect(early.seedUuid(3, '05')).toBe(late.seedUuid(3, '05'))

      // Negative control: if vi.resetModules() silently failed to force a fresh module
      // evaluation, `early`/`late`/`nextDay` would all be the same cached module instance and
      // the positive assertion above would pass vacuously regardless of the anchor's day
      // granularity. Asserting a genuine divergence across a real UTC day boundary proves the
      // reset actually re-evaluated the module each time.
      vi.setSystemTime(new Date('2026-03-06T00:05:00.000Z'))
      vi.resetModules()
      const nextDay = await import('./common.mts')

      expect(nextDay.seedUuid(3, '05')).not.toBe(early.seedUuid(3, '05'))
    } finally {
      vi.useRealTimers()
      vi.resetModules()
    }
  })
})

describe('seedRelationIdAfterPost', () => {
  it('produces a UUIDv7 timestamped after its subject post, satisfying CHECK (id > subject_id)', () => {
    for (const postIndex of [0, 1, 50_000, 99_999]) {
      const postId = seedUuid(postIndex, '05')
      const relationId = seedRelationIdAfterPost(postIndex, postIndex)
      expect(relationId).toMatch(UUIDV7_PATTERN)
      // Postgres's UUID CHECK (id > subject_id) compares byte-wise, which for two
      // same-shaped UUIDv7 strings is equivalent to comparing their timestamp prefixes.
      expect(timestampMsOf(relationId)).toBeGreaterThan(timestampMsOf(postId))
    }
  })

  it('keeps every relation id unique across a seeded range even when post indexes repeat', () => {
    const ids = new Set(
      Array.from({ length: 500 }, (_, relationIndex) =>
        seedRelationIdAfterPost(relationIndex % 100, relationIndex),
      ),
    )
    expect(ids.size).toBe(500)
  })

  it('stays pinned to its subject post id across calls made at different real times', () => {
    const postIndex = 123
    const postId = seedUuid(postIndex, '05')
    vi.useFakeTimers()
    try {
      vi.advanceTimersByTime(5 * 60_000)
      const relationId = seedRelationIdAfterPost(postIndex, 0)
      expect(timestampMsOf(relationId) - timestampMsOf(postId)).toBe(1000)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('commentSeedTimestampMs', () => {
  it('chains each comment tier strictly after the root post and the tier before it', () => {
    const postId = seedUuid(0, '05')
    const tier1 = commentSeedTimestampMs(0, 1)
    const tier2 = commentSeedTimestampMs(0, 2)
    const tier3 = commentSeedTimestampMs(0, 3)

    expect(tier1).toBeGreaterThan(timestampMsOf(postId))
    expect(tier2).toBeGreaterThan(tier1)
    expect(tier3).toBeGreaterThan(tier2)
  })

  it('satisfies CHECK (id > parent_id) / CHECK (id > root_id) for every L1/L2/L3 comment id seedComments generates', () => {
    const rootPostId = seedUuid(0, '05')
    const rootPostTimestampMs = timestampMsOf(rootPostId)

    for (let i = 0; i < 5; i++) {
      const l1Id = seedUuidAtTimestamp(commentSeedTimestampMs(0, 1), i)
      // L1's parent_id and root_id are both rootPostId.
      expect(timestampMsOf(l1Id)).toBeGreaterThan(rootPostTimestampMs)
    }

    for (let i = 0; i < 5; i++) {
      const l2Id = seedUuidAtTimestamp(commentSeedTimestampMs(0, 2), i)
      const l1ParentId = seedUuidAtTimestamp(commentSeedTimestampMs(0, 1), i)
      expect(timestampMsOf(l2Id)).toBeGreaterThan(timestampMsOf(l1ParentId))
      expect(timestampMsOf(l2Id)).toBeGreaterThan(rootPostTimestampMs) // root_id
    }

    for (let i = 0; i < 10; i++) {
      const l3Id = seedUuidAtTimestamp(commentSeedTimestampMs(0, 3), i)
      const l2ParentId = seedUuidAtTimestamp(commentSeedTimestampMs(0, 2), i % 5)
      expect(timestampMsOf(l3Id)).toBeGreaterThan(timestampMsOf(l2ParentId))
      expect(timestampMsOf(l3Id)).toBeGreaterThan(rootPostTimestampMs) // root_id
    }
  })

  it('keeps tiers stable across calls even as the system clock advances', () => {
    const before = commentSeedTimestampMs(0, 2)
    vi.useFakeTimers()
    try {
      vi.advanceTimersByTime(60_000)
      const after = commentSeedTimestampMs(0, 2)
      expect(after).toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })
})
