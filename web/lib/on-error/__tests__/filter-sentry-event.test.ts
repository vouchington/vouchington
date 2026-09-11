import type { ErrorEvent, EventHint } from '@sentry/nextjs'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/error'
import { filterSentryEvent } from '../filter-sentry-event'

function makeEvent(): ErrorEvent {
  return { type: undefined } as ErrorEvent
}

describe('filterSentryEvent', () => {
  it('drops 4xx ApiError events', () => {
    const event = makeEvent()
    const hint: EventHint = { originalException: new ApiError('Bad', 400) }
    expect(filterSentryEvent(event, hint)).toBeNull()
  })

  it('passes 5xx ApiError events through', () => {
    const event = makeEvent()
    const hint: EventHint = { originalException: new ApiError('Boom', 500) }
    expect(filterSentryEvent(event, hint)).toBe(event)
  })

  it('passes non-ApiError events through', () => {
    const event = makeEvent()
    const hint: EventHint = { originalException: new Error('something') }
    expect(filterSentryEvent(event, hint)).toBe(event)
  })

  it('passes events with no originalException through', () => {
    const event = makeEvent()
    expect(filterSentryEvent(event, {})).toBe(event)
  })

  it('passes events with an undefined hint through', () => {
    const event = makeEvent()
    expect(filterSentryEvent(event, undefined as unknown as EventHint)).toBe(event)
  })
})
