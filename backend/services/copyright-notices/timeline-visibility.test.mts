import { readCopyrightLifecycleEventTypes } from '@voucha/test-helpers/data-stores/psql/copyright-lifecycle-event-types'
import { describe, expect, it } from 'vitest'
import {
  copyrightTimelineEventAudience,
  copyrightTimelineEventTypesFor,
} from './timeline-visibility.mts'

const internalEventPattern = /^guest_capability_|_replayed$|^legal_hold_|_intent_created$/

describe('copyright timeline audience decisions', () => {
  it('decides an audience for every database event type and for nothing else', async () => {
    const databaseEventTypes = await readCopyrightLifecycleEventTypes()

    expect(Object.keys(copyrightTimelineEventAudience).sort()).toEqual(
      [...databaseEventTypes].sort(),
    )
  })

  it('keeps internal, replay, legal-hold, and guest-capability events from members and participants', async () => {
    const internalEventTypes = (await readCopyrightLifecycleEventTypes()).filter(eventType =>
      internalEventPattern.test(eventType),
    )
    expect(internalEventTypes.length).toBeGreaterThan(0)

    for (const audience of ['member', 'participant'] as const) {
      for (const eventType of internalEventTypes) {
        expect(copyrightTimelineEventTypesFor(audience)).not.toContain(eventType)
      }
    }
  })

  it('widens the audiences cumulatively and leaves staff unfiltered', () => {
    const member = copyrightTimelineEventTypesFor('member')
    const participant = copyrightTimelineEventTypesFor('participant')

    expect(member).not.toContain('court_or_ccb_hold_received')
    expect(participant).toEqual(expect.arrayContaining([...(member ?? [])]))
    expect(participant).toContain('court_or_ccb_hold_received')
    expect(copyrightTimelineEventTypesFor('staff')).toBeNull()
  })
})
