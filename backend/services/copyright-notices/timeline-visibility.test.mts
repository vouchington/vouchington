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

    expect(Object.keys(copyrightTimelineEventAudience).toSorted()).toEqual(
      [...databaseEventTypes].toSorted(),
    )
  })

  it('keeps internal, replay, legal-hold, and guest-capability events from members', async () => {
    const internalEventTypes = (await readCopyrightLifecycleEventTypes()).filter(eventType =>
      internalEventPattern.test(eventType),
    )
    expect(internalEventTypes.length).toBeGreaterThan(0)

    for (const eventType of internalEventTypes) {
      expect(copyrightTimelineEventTypesFor('member')).not.toContain(eventType)
    }
  })

  it('gives members only the case-facing events and leaves staff unfiltered', () => {
    const member = copyrightTimelineEventTypesFor('member')

    expect(member).toEqual(expect.arrayContaining(['notice_received', 'placement_restored']))
    expect(member).not.toContain('court_or_ccb_hold_received')
    expect(copyrightTimelineEventTypesFor('staff')).toBeNull()
  })
})
