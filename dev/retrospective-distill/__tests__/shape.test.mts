import type { Session } from 'agent-blackboard'
import { describe, expect, it } from 'vitest'

import { entryFixture, sessionFixture } from '../../blackboard/test-helpers/client-fixtures.mts'
import { classifySession, type DistillCutoffs } from '../shape.mts'

const RETRO_CUTOFF = '2026-08-01T00:00:00.000Z'
const SESSION_CUTOFF = '2026-08-15T00:00:00.000Z'
const CUTOFFS: DistillCutoffs = { retroCutoff: RETRO_CUTOFF, sessionCutoff: SESSION_CUTOFF }

const FRESH = '2026-08-20T00:00:00.000Z' // after both cutoffs
const STALE = '2026-07-01T00:00:00.000Z' // before both cutoffs

describe('classifySession', () => {
  it('classifies a session with a retrospective entry as retrospective', () => {
    const session = sessionFixture({ id: 's1', agent: 'claude', version: '1', lastEntryAt: FRESH })
    const entries = [
      entryFixture({ sessionId: 's1', createdAt: STALE, data: { type: 'retrospective' } }),
      entryFixture({ sessionId: 's1', createdAt: FRESH, data: { type: 'note' } }),
    ]
    const result = classifySession(session, entries, CUTOFFS)
    expect(result.shape).toBe('retrospective')
  })

  it('is eligible when the newest retrospective entry is older than retroCutoff', () => {
    const session = sessionFixture({ id: 's1', agent: 'claude', version: '1', lastEntryAt: FRESH })
    const entries = [
      entryFixture({ sessionId: 's1', createdAt: STALE, data: { type: 'retrospective' } }),
    ]
    expect(classifySession(session, entries, CUTOFFS).eligible).toBe(true)
  })

  it('takes the newest of several retrospective entries for retroAt', () => {
    const session = sessionFixture({ id: 's1', agent: 'claude', version: '1', lastEntryAt: FRESH })
    const entries = [
      entryFixture({ sessionId: 's1', createdAt: STALE, data: { type: 'retrospective' } }),
      entryFixture({ sessionId: 's1', createdAt: FRESH, data: { type: 'retrospective' } }),
    ]
    // Newest retrospective (FRESH) is not older than retroCutoff, and lastEntryAt (FRESH) is not
    // older than sessionCutoff either, so neither disjunct of the eligibility formula holds.
    expect(classifySession(session, entries, CUTOFFS).eligible).toBe(false)
  })

  it('is eligible via the session-cutoff disjunct even with no retrospective entry', () => {
    const session = sessionFixture({ id: 's1', agent: 'claude', version: '1', lastEntryAt: STALE })
    const entries = [entryFixture({ sessionId: 's1', createdAt: STALE, data: { type: 'journal' } })]
    expect(classifySession(session, entries, CUTOFFS).eligible).toBe(true)
  })

  it('classifies an entry with a missing or unrecognized type as entry-type-unresolved', () => {
    const session = sessionFixture({ id: 's1', agent: 'claude', version: '1', lastEntryAt: STALE })
    const entries = [entryFixture({ sessionId: 's1', createdAt: STALE, data: {} })]
    const result = classifySession(session, entries, CUTOFFS)
    expect(result.shape).toBe('entry-type-unresolved')
  })

  it('is never eligible when entry-type-unresolved, regardless of age', () => {
    const session = sessionFixture({ id: 's1', agent: 'claude', version: '1', lastEntryAt: STALE })
    const entries = [entryFixture({ sessionId: 's1', createdAt: STALE, data: { type: 'note' } })]
    expect(classifySession(session, entries, CUTOFFS).eligible).toBe(false)
  })

  it('classifies a session whose entries are all checkpoints as checkpoint-only', () => {
    const session = sessionFixture({ id: 's1', agent: 'claude', version: '1', lastEntryAt: STALE })
    const entries = [
      entryFixture({
        sessionId: 's1',
        createdAt: STALE,
        data: { type: 'journal', checkpoint: 'compaction' },
      }),
      entryFixture({
        sessionId: 's1',
        createdAt: STALE,
        data: { type: 'journal', checkpoint: 'push' },
      }),
    ]
    expect(classifySession(session, entries, CUTOFFS).shape).toBe('checkpoint-only')
  })

  it('classifies a mix of checkpoint and hand-written journal entries as journal-only', () => {
    const session = sessionFixture({ id: 's1', agent: 'claude', version: '1', lastEntryAt: STALE })
    const entries = [
      entryFixture({
        sessionId: 's1',
        createdAt: STALE,
        data: { type: 'journal', checkpoint: 'compaction' },
      }),
      entryFixture({ sessionId: 's1', createdAt: STALE, data: { type: 'journal' } }),
    ]
    expect(classifySession(session, entries, CUTOFFS).shape).toBe('journal-only')
  })

  it('classifies a pre-existing unmarked journal entry conservatively as journal-only', () => {
    const session = sessionFixture({ id: 's1', agent: 'claude', version: '1', lastEntryAt: STALE })
    const entries = [entryFixture({ sessionId: 's1', createdAt: STALE, data: { type: 'journal' } })]
    expect(classifySession(session, entries, CUTOFFS).shape).toBe('journal-only')
  })

  it('classifies a zero-entry session with a parentSessionId as zero-entry-child', () => {
    const session = sessionFixture({
      id: 's1',
      agent: 'claude',
      version: '1',
      parentSessionId: 'parent-1',
      lastEntryAt: null,
    })
    expect(classifySession(session, [], CUTOFFS).shape).toBe('zero-entry-child')
  })

  it('classifies a zero-entry session with parentSessionId entirely absent as zero-entry-root', () => {
    // Models an under-validated partition record (see partition-records.mts's unsafe cast): a raw
    // record that omits `parentSessionId` rather than setting it to `null`. `=== null` would
    // silently misroute this to zero-entry-child, the bucket distilling.md treats as expected
    // routine noise instead of a genuine abort signal — `== null` must catch `undefined` too.
    const session = {
      id: 's1',
      agent: 'claude',
      version: '1',
      createdAt: STALE,
      lastEntryAt: null,
      archivedAt: null,
      data: {},
    } as unknown as Session
    expect(classifySession(session, [], CUTOFFS).shape).toBe('zero-entry-root')
  })

  it('classifies a zero-entry session with no parentSessionId as zero-entry-root', () => {
    const session = sessionFixture({
      id: 's1',
      agent: 'claude',
      version: '1',
      parentSessionId: null,
      lastEntryAt: null,
    })
    expect(classifySession(session, [], CUTOFFS).shape).toBe('zero-entry-root')
  })

  it('falls back to createdAt for lastActive when lastEntryAt is null', () => {
    const session = sessionFixture({
      id: 's1',
      agent: 'claude',
      version: '1',
      createdAt: STALE,
      lastEntryAt: null,
    })
    expect(classifySession(session, [], CUTOFFS).eligible).toBe(true)
  })
})
