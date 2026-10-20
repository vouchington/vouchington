import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_SEED_FORWARD_MS,
  SEED_ANCHOR_LAG_MS,
  assertSeedAnchorNotFuture,
  resolveSeedAnchor,
  seedAnchorDayFor,
  SEED_ANCHOR_DATE_ENV,
} from './seed-anchor.mts'

// UUIDv7 prefixes (top 32 bits of the ms timestamp) of 12:00Z on each pinned day.
const OCTOBER_05_PREFIX = '01a10bef'
const OCTOBER_31_PREFIX = '01a191d4'
const NOVEMBER_01_PREFIX = '01a196fb'
const NOVEMBER_02_PREFIX = '01a19c21'

type CommonModule = typeof import('./common.mts')

// seed.mts and run.mts are separate `node` processes: each evaluates seed-data/common.mts from
// scratch against its own wall clock. resetModules() + a dynamic import reproduces that.
async function loadCommonAt(isoNow: string): Promise<CommonModule> {
  vi.setSystemTime(new Date(isoNow))
  vi.resetModules()
  return import('./common.mts')
}

function idsOf(common: CommonModule) {
  return {
    firstPost: common.seedUuid(0, '05'),
    lastPost: common.seedUuid(99_999, '05'),
    relation: common.seedRelationIdAfterPost(3, 1),
    freshRelation: common.seedFreshRelationId(1),
    crawl: common.crawlSeedUuid(0),
    crawlPrefix: common.CRAWL_SEED_PREFIX,
  }
}

describe('seed anchor across the seed and run processes (#2110)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    vi.resetModules()
  })

  it('derives identical ids when UTC midnight falls between the seed and run processes', async () => {
    vi.useFakeTimers()
    vi.stubEnv(SEED_ANCHOR_DATE_ENV, '2026-10-05')

    const seed = idsOf(await loadCommonAt('2026-10-05T23:59:40.000Z'))
    const run = idsOf(await loadCommonAt('2026-10-06T00:01:13.000Z'))

    expect(run).toEqual(seed)
  })

  it('derives identical crawl ids when a month boundary falls between the two processes', async () => {
    vi.useFakeTimers()
    vi.stubEnv(SEED_ANCHOR_DATE_ENV, '2026-10-31')

    const seed = idsOf(await loadCommonAt('2026-10-31T23:59:40.000Z'))
    const run = idsOf(await loadCommonAt('2026-11-01T00:01:13.000Z'))

    expect(run).toEqual(seed)
    expect(run.crawlPrefix).toBe(OCTOBER_31_PREFIX)
  })

  it('anchors posts at noon UTC of the pinned day, not of the wall-clock day', async () => {
    vi.useFakeTimers()
    vi.stubEnv(SEED_ANCHOR_DATE_ENV, '2026-10-05')

    const common = await loadCommonAt('2026-12-25T08:00:00.000Z')

    expect(common.postSeedTimestampMs(0)).toBe(Date.UTC(2026, 9, 5, 12))
    expect(common.CRAWL_SEED_PREFIX).toBe(OCTOBER_05_PREFIX)
  })

  it('moves every anchored id when the pinned day changes', async () => {
    vi.useFakeTimers()
    vi.stubEnv(SEED_ANCHOR_DATE_ENV, '2026-10-05')
    const october = idsOf(await loadCommonAt('2026-10-05T12:00:00.000Z'))

    vi.stubEnv(SEED_ANCHOR_DATE_ENV, '2026-11-02')
    const november = idsOf(await loadCommonAt('2026-10-05T12:00:00.000Z'))

    expect(november.firstPost).not.toBe(october.firstPost)
    expect(november.crawlPrefix).toBe(NOVEMBER_02_PREFIX)
    expect(november.crawl).not.toBe(october.crawl)
  })

  it('refuses to load common.mts when the pinned day is malformed', async () => {
    vi.useFakeTimers()
    vi.stubEnv(SEED_ANCHOR_DATE_ENV, 'not-a-date')

    await expect(loadCommonAt('2026-10-05T12:00:00.000Z')).rejects.toThrow(SEED_ANCHOR_DATE_ENV)
  })
})

describe('resolveSeedAnchor', () => {
  it('derives the day anchor and the crawl prefix from the pinned day', () => {
    expect(resolveSeedAnchor('2026-10-05')).toEqual({
      dayAnchorMs: Date.UTC(2026, 9, 5, 12),
      crawlUuidv7Prefix: OCTOBER_05_PREFIX,
    })
  })

  it('moves the crawl prefix with the pinned day', () => {
    const lastOfOctober = resolveSeedAnchor('2026-10-31')
    const firstOfNovember = resolveSeedAnchor('2026-11-01')

    expect(lastOfOctober.crawlUuidv7Prefix).toBe(OCTOBER_31_PREFIX)
    expect(firstOfNovember.crawlUuidv7Prefix).toBe(NOVEMBER_01_PREFIX)
    expect(firstOfNovember.dayAnchorMs - lastOfOctober.dayAnchorMs).toBe(24 * 60 * 60 * 1000)
  })

  it('accepts a leap day and rejects a non-leap one', () => {
    expect(resolveSeedAnchor('2028-02-29').dayAnchorMs).toBe(Date.UTC(2028, 1, 29, 12))
    expect(() => resolveSeedAnchor('2027-02-29')).toThrow(SEED_ANCHOR_DATE_ENV)
  })

  it('falls back to the latest day whose noon has passed when no day is pinned', () => {
    const late = new Date('2026-03-05T23:50:00.000Z')
    const afterNoon = new Date('2026-03-05T12:15:00.000Z')
    const beforeNoon = new Date('2026-03-05T12:14:59.999Z')
    const early = new Date('2026-03-05T00:05:00.000Z')

    expect(resolveSeedAnchor(undefined, late)).toEqual(resolveSeedAnchor('2026-03-05'))
    expect(resolveSeedAnchor(undefined, afterNoon)).toEqual(resolveSeedAnchor('2026-03-05'))
    expect(resolveSeedAnchor(undefined, beforeNoon)).toEqual(resolveSeedAnchor('2026-03-04'))
    expect(resolveSeedAnchor(undefined, early)).toEqual(resolveSeedAnchor('2026-03-04'))
  })

  it('ignores the clock entirely when a day is pinned', () => {
    expect(resolveSeedAnchor('2026-10-05', new Date('2031-01-01T00:00:00.000Z'))).toEqual(
      resolveSeedAnchor('2026-10-05', new Date('2020-06-30T23:59:59.999Z')),
    )
  })

  it.each([
    'garbage',
    '',
    ' 2026-10-05',
    '2026-10-05 ',
    '2026-1-05',
    '2026-10-5',
    '20261005',
    '26-10-05',
    '2026/10/05',
    '2026-10-05T00:00:00Z',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-10-00',
    '2026-10-32',
  ])('rejects the malformed day %j and names the variable and value', raw => {
    expect(() => resolveSeedAnchor(raw)).toThrow(SEED_ANCHOR_DATE_ENV)
    expect(() => resolveSeedAnchor(raw)).toThrow(JSON.stringify(raw))
  })
})

// #3409: before noon UTC the anchor was in the future, so database-stamped rows sorted before
// the seeded rows they reference. These cases inject the clock, so they fail at any hour.
describe('seed rows are never dated after the run', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    vi.resetModules()
  })

  const minute = 60_000
  const instants = Array.from(
    { length: 24 * 4 },
    (_, quarter) => new Date(Date.UTC(2026, 9, 31) + quarter * 15 * minute),
  )

  it.each(instants.map(instant => [instant.toISOString(), instant]))(
    'keeps the anchor plus the forward margin at or before %s',
    (_iso, now) => {
      const { dayAnchorMs } = resolveSeedAnchor(seedAnchorDayFor(now), now)

      expect(dayAnchorMs + MAX_SEED_FORWARD_MS).toBeLessThanOrEqual(now.getTime())
      expect(now.getTime() - dayAnchorMs).toBeLessThan(SEED_ANCHOR_LAG_MS + 24 * 60 * minute)
      expect(() => assertSeedAnchorNotFuture(undefined, now)).not.toThrow()
    },
  )

  it('rejects a hand-pinned day whose noon is still ahead', () => {
    const morning = new Date('2026-10-20T01:30:00.000Z')

    expect(() => assertSeedAnchorNotFuture('2026-10-20', morning)).toThrow(
      `${SEED_ANCHOR_DATE_ENV}=2026-10-20 puts seeded rows after 2026-10-20T01:30:00.000Z; pin 2026-10-19`,
    )
    expect(() => assertSeedAnchorNotFuture('2026-10-19', morning)).not.toThrow()
  })

  it('keeps every forward-offset seed helper inside the margin', async () => {
    vi.useFakeTimers()
    vi.stubEnv(SEED_ANCHOR_DATE_ENV, '2026-10-31')
    const common = await loadCommonAt('2026-10-31T12:15:00.000Z')
    const { VOTE_WEIGHT_DISPATCH_ANCHOR_MS, VOTE_WEIGHT_DISPATCH_SEED_COUNT } =
      await import('./vote-weight-dispatch.mts')
    const anchor = common.postSeedTimestampMs(0)
    const uuidMs = (uuid: string) => Number.parseInt(uuid.slice(0, 8) + uuid.slice(9, 13), 16)
    const latest = [
      uuidMs(common.seedFreshRelationId(1)),
      uuidMs(common.seedRelationIdAfterPost(0, 1)),
      uuidMs(common.crawlSeedUuid(0xffff_ffff_ffff, 'ff')),
      common.commentSeedTimestampMs(0, 3),
      VOTE_WEIGHT_DISPATCH_ANCHOR_MS + VOTE_WEIGHT_DISPATCH_SEED_COUNT * 100,
    ]

    for (const timestamp of latest) {
      expect(timestamp - anchor).toBeLessThanOrEqual(MAX_SEED_FORWARD_MS)
    }
  })

  it('matches the day explain-analyze.yml pins', () => {
    const workflow = readFileSync('.github/workflows/explain-analyze.yml', 'utf8')

    expect(workflow).toContain(`date -u -d '-${SEED_ANCHOR_LAG_MS / minute} minutes' +%Y-%m-%d`)
  })
})
