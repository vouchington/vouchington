// The UTC calendar day every deterministic, clock-derived seed id is pinned to.
//
// seed.mts and run.mts are two SEPARATE `node` processes (two CI workflow steps). Run steps
// re-derive each seeded id (post ids, crawl ids) from this anchor instead of hardcoding the
// address, so both processes must agree on it. Deriving it from each process's own wall clock
// silently breaks when an anchor-day boundary falls between the two steps (#2110). So the day is chosen once and handed to both processes through this variable:
// explain-analyze.yml sets it for the whole job, and a local run that may cross midnight can
// export it for the session. Do not pin it permanently: the newest seeded post is stamped at the
// anchor, so a stale pin ages every post out of the `1w` time-range windows the heavy feed
// scenarios filter on.
export const SEED_ANCHOR_DATE_ENV = 'EXPLAIN_SEED_ANCHOR_DATE'

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

// Seeded rows are never dated after the run. Rows the database stamps itself (`uuidv7()` ids,
// `now()` columns) must sort after every seeded row they reference, and relation tables check
// `id > subject_id`. A noon anchor on the run's own day was in the future until noon UTC (#3409).
// MAX_SEED_FORWARD_MS bounds how far any seed helper stamps a row after the anchor;
// seed-anchor.test.mts checks each forward-offset helper against it.
export const MAX_SEED_FORWARD_MS = 15 * 60_000
// The anchor day is the UTC day of (now - SEED_ANCHOR_LAG_MS): the latest day whose noon plus
// MAX_SEED_FORWARD_MS has already passed. explain-analyze.yml pins the same day with GNU `date`.
export const SEED_ANCHOR_LAG_MS = 12 * 60 * 60_000 + MAX_SEED_FORWARD_MS

export interface SeedAnchor {
  // Noon UTC on the anchor day, 15 minutes to 24 hours 15 minutes before the run starts, safely
  // inside the `time_range: '1w'` window the heavy feed scenarios filter on. seed-clock.mts pins
  // the scenario callbacks' `Date` to this instant, so time-range cutoffs do not drift with the
  // run's time of day.
  dayAnchorMs: number
  // 8-hex UUIDv7 prefix of the anchor instant, rounded down. A crawl id adds at most 65.28 s
  // below the prefix, inside MAX_SEED_FORWARD_MS.
  crawlUuidv7Prefix: string
}

function parseAnchorDay(raw: string): { year: number; month: number; day: number } {
  const match = ISO_DAY.exec(raw)
  if (match !== null) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
    // Date.UTC rolls an impossible day (02-30, 13-01) into the next valid one; require the round
    // trip to land on the same calendar day.
    const roundTrip = new Date(Date.UTC(year, month - 1, day))
    if (
      roundTrip.getUTCFullYear() === year &&
      roundTrip.getUTCMonth() === month - 1 &&
      roundTrip.getUTCDate() === day
    ) {
      return { year, month, day }
    }
  }
  throw new Error(
    `Invalid ${SEED_ANCHOR_DATE_ENV}: ${JSON.stringify(raw)} (expected a real UTC calendar day ` +
      `formatted YYYY-MM-DD, or leave it unset to use seedAnchorDayFor(now))`,
  )
}

// `rawDate` is the variable's value. Only `undefined` means "unset"; an empty string is rejected
// so a workflow that fails to populate the variable cannot silently fall back to a per-process
// clock read, which is exactly the failure this variable exists to prevent.
export function resolveSeedAnchor(rawDate: string | undefined, now: Date = new Date()): SeedAnchor {
  const { year, month, day } = parseAnchorDay(rawDate ?? seedAnchorDayFor(now))
  const dayAnchorMs = Date.UTC(year, month - 1, day, 12)
  return {
    dayAnchorMs,
    crawlUuidv7Prefix: dayAnchorMs.toString(16).padStart(12, '0').slice(0, 8),
  }
}

export function seedAnchorDayFor(now: Date): string {
  return new Date(now.getTime() - SEED_ANCHOR_LAG_MS).toISOString().slice(0, 10)
}

// A day pinned by hand, such as today's date exported before noon, would date the seed after the
// run. Fail before seeding or capturing instead of at the first database-stamped insert.
export function assertSeedAnchorNotFuture(
  rawDate: string | undefined,
  now: Date = new Date(),
): void {
  const { dayAnchorMs } = resolveSeedAnchor(rawDate, now)
  if (dayAnchorMs + MAX_SEED_FORWARD_MS > now.getTime()) {
    throw new Error(
      `${SEED_ANCHOR_DATE_ENV}=${rawDate} puts seeded rows after ${now.toISOString()}; ` +
        `pin ${seedAnchorDayFor(now)} or leave it unset`,
    )
  }
}
