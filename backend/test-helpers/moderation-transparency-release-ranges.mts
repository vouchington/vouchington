const DAY_MS = 24 * 60 * 60 * 1_000

/** The `[start, end)` range of every closed UTC day of a reserved test window as of `now`. */
export function releaseTestWindowRange(now: Date): [Date, Date] {
  const cutoff = Math.floor((now.getTime() - 2 * DAY_MS) / DAY_MS) * DAY_MS - 1
  return [new Date(Date.UTC(now.getUTCFullYear() - 3, 0, 1)), new Date(cutoff + 1)]
}

/** The `[start, end)` range of the UTC day containing `occurredAt`. */
export function releaseTestDayRange(occurredAt: Date): [Date, Date] {
  const day = Date.UTC(
    occurredAt.getUTCFullYear(),
    occurredAt.getUTCMonth(),
    occurredAt.getUTCDate(),
  )
  return [new Date(day), new Date(day + DAY_MS)]
}
