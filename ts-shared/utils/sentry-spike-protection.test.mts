import { describe, expect, it } from 'vitest'
import { createSpikeWindowTracker, withSpikeProtection } from './sentry-spike-protection.mts'

interface StubEvent {
  id: string
  exception?: { values?: Array<{ type?: string; value?: string }> }
  message?: string
  fingerprint?: string[]
}

function exceptionEvent(id: string, type: string, value: string): StubEvent {
  return { id, exception: { values: [{ type, value }] } }
}

describe('withSpikeProtection', () => {
  it('passes an identical error through up to the limit, then drops further occurrences in the same window', () => {
    const protectedBeforeSend = withSpikeProtection<StubEvent, undefined>(event => event, {
      limit: 3,
      windowMs: 60_000,
    })

    const admitted = [1, 2, 3, 4, 5].map(n =>
      protectedBeforeSend(exceptionEvent(String(n), 'TypeError', 'boom'), undefined),
    )

    expect(admitted).toEqual([
      exceptionEvent('1', 'TypeError', 'boom'),
      exceptionEvent('2', 'TypeError', 'boom'),
      exceptionEvent('3', 'TypeError', 'boom'),
      null,
      null,
    ])
  })

  it('tracks distinct errors independently, so one spiking error does not suppress another', () => {
    const protectedBeforeSend = withSpikeProtection<StubEvent, undefined>(event => event, {
      limit: 1,
      windowMs: 60_000,
    })

    expect(protectedBeforeSend(exceptionEvent('a1', 'TypeError', 'boom'), undefined)).not.toBeNull()
    expect(protectedBeforeSend(exceptionEvent('a2', 'TypeError', 'boom'), undefined)).toBeNull()
    expect(
      protectedBeforeSend(exceptionEvent('b1', 'RangeError', 'oops'), undefined),
    ).not.toBeNull()
  })

  it('resets the count once the window elapses, admitting the error again', () => {
    let clock = 0
    const protectedBeforeSend = withSpikeProtection<StubEvent, undefined>(event => event, {
      limit: 1,
      windowMs: 1_000,
      now: () => clock,
    })

    expect(protectedBeforeSend(exceptionEvent('1', 'TypeError', 'boom'), undefined)).not.toBeNull()
    expect(protectedBeforeSend(exceptionEvent('2', 'TypeError', 'boom'), undefined)).toBeNull()

    clock = 1_001
    expect(protectedBeforeSend(exceptionEvent('3', 'TypeError', 'boom'), undefined)).not.toBeNull()
  })

  it('prefers an explicit fingerprint over the exception type and value', () => {
    const protectedBeforeSend = withSpikeProtection<StubEvent, undefined>(event => event, {
      limit: 1,
      windowMs: 60_000,
    })

    const first: StubEvent = { id: '1', fingerprint: ['shared-group'], message: 'first message' }
    const second: StubEvent = { id: '2', fingerprint: ['shared-group'], message: 'second message' }

    expect(protectedBeforeSend(first, undefined)).not.toBeNull()
    expect(protectedBeforeSend(second, undefined)).toBeNull()
  })

  it('falls back to the message when there is no exception or fingerprint', () => {
    const protectedBeforeSend = withSpikeProtection<StubEvent, undefined>(event => event, {
      limit: 1,
      windowMs: 60_000,
    })

    expect(protectedBeforeSend({ id: '1', message: 'disk full' }, undefined)).not.toBeNull()
    expect(protectedBeforeSend({ id: '2', message: 'disk full' }, undefined)).toBeNull()
  })

  it('never suppresses events with no exception, message, or fingerprint to dedupe on', () => {
    const protectedBeforeSend = withSpikeProtection<StubEvent, undefined>(event => event, {
      limit: 1,
      windowMs: 60_000,
    })

    expect(protectedBeforeSend({ id: '1' }, undefined)).toEqual({ id: '1' })
    expect(protectedBeforeSend({ id: '2' }, undefined)).toEqual({ id: '2' })
    expect(protectedBeforeSend({ id: '3' }, undefined)).toEqual({ id: '3' })
  })

  it('does not count an event the wrapped beforeSend already dropped', () => {
    const protectedBeforeSend = withSpikeProtection<StubEvent, undefined>(
      event => (event.id === 'drop-me' ? null : event),
      { limit: 1, windowMs: 60_000 },
    )

    expect(
      protectedBeforeSend(exceptionEvent('drop-me', 'TypeError', 'boom'), undefined),
    ).toBeNull()
    expect(
      protectedBeforeSend(exceptionEvent('keep-me', 'TypeError', 'boom'), undefined),
    ).not.toBeNull()
  })

  it('applies spike protection to the resolved value of an async wrapped beforeSend', async () => {
    const protectedBeforeSend = withSpikeProtection<StubEvent, undefined>(
      async event => Promise.resolve(event),
      { limit: 1, windowMs: 60_000 },
    )

    await expect(
      protectedBeforeSend(exceptionEvent('1', 'TypeError', 'boom'), undefined),
    ).resolves.not.toBeNull()
    await expect(
      protectedBeforeSend(exceptionEvent('2', 'TypeError', 'boom'), undefined),
    ).resolves.toBeNull()
  })

  it('uses the default limit and window when no options are given', () => {
    const protectedBeforeSend = withSpikeProtection<StubEvent, undefined>(event => event)

    const admitted = Array.from({ length: 11 }, (_, n) =>
      protectedBeforeSend(exceptionEvent(String(n), 'TypeError', 'boom'), undefined),
    )

    expect(admitted.filter(event => event !== null)).toHaveLength(10)
    expect(admitted.at(-1)).toBeNull()
  })
})

describe('createSpikeWindowTracker', () => {
  it('evicts expired fingerprints instead of retaining every fingerprint ever seen', () => {
    let clock = 0
    const tracker = createSpikeWindowTracker(1, 1_000)

    // A long-lived process fingerprinting on exception.value (which routinely embeds
    // per-request UUIDs/URLs) sees effectively unbounded distinct fingerprints over its
    // lifetime. Simulate many distinct fingerprints, each in its own now-expired window.
    for (let n = 0; n < 500; n++) {
      tracker.recordAndCheck(`fingerprint-${n}`, clock)
      clock += 1_000 // always past the 1_000ms window of the previous fingerprint
    }

    // One more record forces a sweep at the current clock; every prior window has expired,
    // so only the fingerprint just recorded remains -- proof of eviction, not merely of the
    // per-fingerprint reset-on-stale-window logic (which alone would never shrink `size`).
    tracker.recordAndCheck('final-fingerprint', clock)

    expect(tracker.size).toBe(1)
  })

  it('keeps concurrently-fresh fingerprints within the same window', () => {
    const tracker = createSpikeWindowTracker(5, 60_000)

    tracker.recordAndCheck('a', 0)
    tracker.recordAndCheck('b', 0)
    tracker.recordAndCheck('c', 0)

    expect(tracker.size).toBe(3)
  })
})
