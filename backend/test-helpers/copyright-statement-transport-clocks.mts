import { expect } from 'vitest'
import { getCopyrightNoticesWorkLimit } from '../services/copyright-notices/work-limits.mts'
import type { StatementTransportState } from './copyright-statement-transport-state.mts'

function clockBounds(
  before: StatementTransportState,
  after: StatementTransportState,
  start: Date,
  end: Date,
) {
  return (
    ['leased_at', 'delivery_attempted_at', 'available_at', 'updated_at', 'sent_at'] as const
  ).flatMap(key =>
    after.work[key] === before.work[key]
      ? []
      : [
          {
            key,
            valid:
              typeof after.work[key] === 'string' &&
              new Date(after.work[key]) >= start &&
              new Date(after.work[key]) <= end,
          },
        ],
  )
}

export function assertTransportClocks(
  before: StatementTransportState,
  after: StatementTransportState,
  start: Date,
  end: Date,
) {
  expect(clockBounds(before, after, start, end).every(row => row.valid)).toBe(true)
  const within = (value: string) => new Date(value) >= start && new Date(value) <= end
  expect(after.attempts.slice(before.attempts.length).every(row => within(row.started_at))).toBe(
    true,
  )
  expect(
    after.results
      .slice(before.results.length)
      .every(row => row.sent_at !== null && within(row.sent_at)),
  ).toBe(true)
  const lease =
    after.work.lease_token === null
      ? []
      : after.attempts.filter(row => row.lease_token === after.work.lease_token)
  const leaseValid =
    after.work.lease_token === null ||
    (lease.length === 1 &&
      lease[0]!.started_at === after.work.leased_at &&
      after.work.lease_expires_at !== null &&
      after.work.leased_at !== null &&
      new Date(after.work.lease_expires_at) > new Date(after.work.leased_at))
  expect(leaseValid).toBe(true)
  const leaseMilliseconds = getCopyrightNoticesWorkLimit('delivery_lease_minutes') * 60_000
  const expiryValid =
    after.work.lease_expires_at === null ||
    (new Date(after.work.lease_expires_at).getTime() >= start.getTime() + leaseMilliseconds &&
      new Date(after.work.lease_expires_at).getTime() <= end.getTime() + leaseMilliseconds)
  expect(expiryValid).toBe(true)
}
