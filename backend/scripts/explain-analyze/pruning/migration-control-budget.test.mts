import { describe, expect, it } from 'vitest'
import { migrationCommandSeconds, migrationControlDeadlineMs } from './migration-control-budget.mts'

describe('migration control budget', () => {
  it('budgets the child from the 45 second control, including after an 8.5 second hosted pre-creation phase', () => {
    expect(migrationControlDeadlineMs).toBe(45_000)
    expect(migrationCommandSeconds(45_000, false)).toBe(22)
    expect(migrationCommandSeconds(45_000 - 8_500, false)).toBe(14)
  })

  it.each([
    { remainingMs: 23_499, cleaning: false, seconds: 0 },
    { remainingMs: 23_500, cleaning: false, seconds: 1 },
    { remainingMs: 10_999, cleaning: true, seconds: 0 },
    { remainingMs: 11_500, cleaning: true, seconds: 1 },
    { remainingMs: 0, cleaning: true, seconds: -11 },
  ])('allows $seconds s at $remainingMs ms (cleaning $cleaning)', ({ remainingMs, ...rest }) => {
    expect(migrationCommandSeconds(remainingMs, rest.cleaning)).toBe(rest.seconds)
  })
})
