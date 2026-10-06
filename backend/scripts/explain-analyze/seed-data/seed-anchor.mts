// The UTC calendar day every deterministic, clock-derived seed id is pinned to.
//
// seed.mts and run.mts are two SEPARATE `node` processes (two CI workflow steps). Run steps
// re-derive each seeded id (post ids, crawl ids) from this anchor instead of hardcoding the
// address, so both processes must agree on it. Deriving it from each process's own wall clock
// silently breaks when UTC midnight (or a month boundary, for crawl ids) falls between the two
// steps (#2110). So the day is chosen once and handed to both processes through this variable:
// explain-analyze.yml sets it for the whole job, and a local run that may cross midnight can
// export it for the session. Do not pin it permanently: the newest seeded post is stamped at the
// anchor, so a stale pin ages every post out of the `1w` time-range windows the heavy feed
// scenarios filter on.
export const SEED_ANCHOR_DATE_ENV = 'EXPLAIN_SEED_ANCHOR_DATE'

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

export interface SeedAnchor {
  // Noon UTC on the anchor day: a post never lands more than ~12h off "now" on the day the seed
  // runs, safely inside the `time_range: '1w'` window the heavy feed scenarios filter on.
  dayAnchorMs: number
  // 8-hex UUIDv7 prefix of mid-month noon UTC in the anchor day's month, so a crawl id never
  // straddles a month boundary the way a per-process clock read would.
  monthUuidv7Prefix: string
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
      `formatted YYYY-MM-DD, or leave it unset to use the current UTC day)`,
  )
}

// `rawDate` is the variable's value. Only `undefined` means "unset"; an empty string is rejected
// so a workflow that fails to populate the variable cannot silently fall back to a per-process
// clock read, which is exactly the failure this variable exists to prevent.
export function resolveSeedAnchor(rawDate: string | undefined, now: Date = new Date()): SeedAnchor {
  const { year, month, day } =
    rawDate === undefined
      ? { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() }
      : parseAnchorDay(rawDate)
  const midMonthMs = Date.UTC(year, month - 1, 15, 12)
  return {
    dayAnchorMs: Date.UTC(year, month - 1, day, 12),
    monthUuidv7Prefix: midMonthMs.toString(16).padStart(12, '0').slice(0, 8),
  }
}
