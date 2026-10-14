import { describe, expect, it } from 'vitest'
import { finishEntityReconciliationCheckpoint } from './entity-reconciliation-checkpoint-outcome.mts'

function captureFailure(action: () => unknown) {
  let failed = false
  let reason: unknown
  try {
    action()
  } catch (err) {
    failed = true
    reason = err
  }
  return { failed, reason }
}

describe('entity reconciliation checkpoint outcome', () => {
  it('returns the callback result without changing its identity', () => {
    const value = {}
    expect(finishEntityReconciliationCheckpoint({ ok: true, value }, [])).toBe(value)
    expect(finishEntityReconciliationCheckpoint({ ok: true, value: undefined }, [])).toBeUndefined()
  })

  it('preserves a raw undefined callback failure without cleanup failures', () => {
    const result = captureFailure(() =>
      finishEntityReconciliationCheckpoint({ ok: false, error: undefined }, []),
    )
    expect(result.failed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('preserves the raw callback error identity without cleanup failures', () => {
    const primary = new Error('callback')
    const result = captureFailure(() =>
      finishEntityReconciliationCheckpoint({ ok: false, error: primary }, []),
    )
    expect(result.failed).toBe(true)
    expect(result.reason).toBe(primary)
  })

  it('retains each undefined cleanup failure and the undefined callback cause', () => {
    const result = captureFailure(() =>
      finishEntityReconciliationCheckpoint({ ok: false, error: undefined }, [undefined, undefined]),
    )
    expect(result.failed).toBe(true)
    expect(result.reason).toBeInstanceOf(AggregateError)
    const error = result.reason as AggregateError
    expect(error.errors).toEqual([undefined, undefined])
    expect(Object.hasOwn(error, 'cause')).toBe(true)
    expect(error.cause).toBeUndefined()
  })

  it('retains distinct failed operations sharing the callback error identity', () => {
    const primary = new Error('shared callback and cleanup reason')
    const result = captureFailure(() =>
      finishEntityReconciliationCheckpoint({ ok: false, error: primary }, [primary, primary]),
    )
    expect(result.failed).toBe(true)
    expect(result.reason).toBeInstanceOf(AggregateError)
    const error = result.reason as AggregateError
    expect(error.cause).toBe(primary)
    expect(error.errors).toHaveLength(2)
    expect(error.errors[0]).toBe(primary)
    expect(error.errors[1]).toBe(primary)
  })

  it('keeps the distinct raw callback cause separate from ordered cleanup failures', () => {
    const primary = new Error('callback')
    const rollback = new Error('rollback')
    const unlock = new Error('unlock')
    const result = captureFailure(() =>
      finishEntityReconciliationCheckpoint({ ok: false, error: primary }, [rollback, unlock]),
    )
    expect(result.failed).toBe(true)
    expect(result.reason).toBeInstanceOf(AggregateError)
    const error = result.reason as AggregateError
    expect(error.cause).toBe(primary)
    expect(error.errors).toHaveLength(2)
    expect(error.errors[0]).toBe(rollback)
    expect(error.errors[1]).toBe(unlock)
  })

  it('preserves operation order and raw identities after a successful callback', () => {
    const first = new Error('rollback')
    const last = new Error('unlock')
    const ledger = [first, undefined, last, first]
    const result = captureFailure(() =>
      finishEntityReconciliationCheckpoint({ ok: true, value: 'done' }, ledger),
    )
    expect(result.failed).toBe(true)
    expect(result.reason).toBeInstanceOf(AggregateError)
    const error = result.reason as AggregateError
    expect(error.cause).toBe(first)
    expect(error.errors).toHaveLength(4)
    expect(error.errors[0]).toBe(first)
    expect(error.errors[1]).toBeUndefined()
    expect(error.errors[2]).toBe(last)
    expect(error.errors[3]).toBe(first)
    expect(ledger).toEqual([first, undefined, last, first])
  })
})
