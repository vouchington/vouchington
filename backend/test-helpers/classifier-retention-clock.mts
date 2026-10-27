import { vi } from 'vitest'

const RealDate = Date
let realClockActive = false

/**
 * AI-usage tests reserve a synthetic day in years 8000–9000. Classifier admission and reports
 * compare UUIDv7 receipts from PostgreSQL's real clock with the application clock, so keep those
 * operations on the real clock while leaving the reserved usage day in place for billing writes.
 * Only serial reservation and read-only report calls may use this global clock switch.
 */
export async function withRealClassifierClock<T>(fn: () => Promise<T>): Promise<T> {
  if (realClockActive) throw new Error('Concurrent classifier test clock switch is unsafe')
  if (Date === RealDate) return fn()
  const reservedDay = new Date()
  vi.setSystemTime(new RealDate())
  realClockActive = true
  try {
    return await fn()
  } finally {
    try {
      vi.setSystemTime(reservedDay)
    } finally {
      realClockActive = false
    }
  }
}
