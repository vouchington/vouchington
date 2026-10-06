import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveSeedAnchor, SEED_ANCHOR_DATE_ENV } from './seed-anchor.mts'

// UUIDv7 prefixes (top 32 bits of the ms timestamp) of the 15th of each month at 12:00Z.
const OCTOBER_2026_PREFIX = '01a13f6e'
const NOVEMBER_2026_PREFIX = '01a1df14'

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
    expect(run.crawlPrefix).toBe(OCTOBER_2026_PREFIX)
  })

  it('anchors posts at noon UTC of the pinned day, not of the wall-clock day', async () => {
    vi.useFakeTimers()
    vi.stubEnv(SEED_ANCHOR_DATE_ENV, '2026-10-05')

    const common = await loadCommonAt('2026-12-25T08:00:00.000Z')

    expect(common.postSeedTimestampMs(0)).toBe(Date.UTC(2026, 9, 5, 12))
    expect(common.CRAWL_SEED_PREFIX).toBe(OCTOBER_2026_PREFIX)
  })

  it('moves every anchored id when the pinned day changes', async () => {
    vi.useFakeTimers()
    vi.stubEnv(SEED_ANCHOR_DATE_ENV, '2026-10-05')
    const october = idsOf(await loadCommonAt('2026-10-05T12:00:00.000Z'))

    vi.stubEnv(SEED_ANCHOR_DATE_ENV, '2026-11-02')
    const november = idsOf(await loadCommonAt('2026-10-05T12:00:00.000Z'))

    expect(november.firstPost).not.toBe(october.firstPost)
    expect(november.crawlPrefix).toBe(NOVEMBER_2026_PREFIX)
    expect(november.crawl).not.toBe(october.crawl)
  })

  it('refuses to load common.mts when the pinned day is malformed', async () => {
    vi.useFakeTimers()
    vi.stubEnv(SEED_ANCHOR_DATE_ENV, 'not-a-date')

    await expect(loadCommonAt('2026-10-05T12:00:00.000Z')).rejects.toThrow(SEED_ANCHOR_DATE_ENV)
  })
})

describe('resolveSeedAnchor', () => {
  it('derives the day anchor and the month prefix from the pinned day', () => {
    expect(resolveSeedAnchor('2026-10-05')).toEqual({
      dayAnchorMs: Date.UTC(2026, 9, 5, 12),
      monthUuidv7Prefix: OCTOBER_2026_PREFIX,
    })
  })

  it('moves the month prefix exactly at a month boundary', () => {
    const lastOfOctober = resolveSeedAnchor('2026-10-31')
    const firstOfNovember = resolveSeedAnchor('2026-11-01')

    expect(lastOfOctober.monthUuidv7Prefix).toBe(OCTOBER_2026_PREFIX)
    expect(firstOfNovember.monthUuidv7Prefix).toBe(NOVEMBER_2026_PREFIX)
    expect(resolveSeedAnchor('2026-10-01').monthUuidv7Prefix).toBe(OCTOBER_2026_PREFIX)
    expect(firstOfNovember.dayAnchorMs - lastOfOctober.dayAnchorMs).toBe(24 * 60 * 60 * 1000)
  })

  it('accepts a leap day and rejects a non-leap one', () => {
    expect(resolveSeedAnchor('2028-02-29').dayAnchorMs).toBe(Date.UTC(2028, 1, 29, 12))
    expect(() => resolveSeedAnchor('2027-02-29')).toThrow(SEED_ANCHOR_DATE_ENV)
  })

  it('falls back to the current UTC day when no day is pinned', () => {
    const late = new Date('2026-03-05T23:50:00.000Z')
    const early = new Date('2026-03-05T00:05:00.000Z')

    expect(resolveSeedAnchor(undefined, late)).toEqual(resolveSeedAnchor('2026-03-05'))
    expect(resolveSeedAnchor(undefined, early)).toEqual(resolveSeedAnchor('2026-03-05'))
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
