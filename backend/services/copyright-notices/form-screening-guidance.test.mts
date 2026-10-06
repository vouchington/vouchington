import { describe, expect, it } from 'vitest'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { parseCopyrightFormGuidance } from './form-screening-guidance.mts'

type Mutable = Record<string, unknown> & {
  elements: Array<Record<string, unknown>>
  risk_notes: Array<Record<string, unknown>>
}

function guidanceWith(change: (guidance: Mutable) => void): unknown {
  const guidance = structuredClone(testCopyrightFormGuidance) as unknown as Mutable
  change(guidance)
  return guidance
}

const riskNote = { kind: 'abuse_signal', note: 'Repeated filings against one poster.' }
const riskNotes = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ ...riskNote, note: `Signal ${index}.` }))

describe('copyright form guidance parser', () => {
  it('accepts the complete six-element checklist with bounded notes', () => {
    const guidance = guidanceWith(value => {
      value.elements[1] = { element: 'work_identification', status: 'unclear', gap: 'No URL.' }
      value.risk_notes = riskNotes(6)
      value.suggested_action = 'escalate_to_owner'
    })
    expect(parseCopyrightFormGuidance(guidance)).toEqual(guidance)
  })

  it.each([
    ['a missing object', null],
    ['an array', []],
    ['a string', 'approve_intake'],
    ['an extra top-level key', guidanceWith(value => (value.decision = 'takedown'))],
    ['a missing top-level key', guidanceWith(value => Reflect.deleteProperty(value, 'risk_notes'))],
    ['an empty summary', guidanceWith(value => (value.summary = '   '))],
    ['an oversized summary', guidanceWith(value => (value.summary = 'x'.repeat(2001)))],
    ['an unknown action', guidanceWith(value => (value.suggested_action = 'takedown'))],
    ['a missing element', guidanceWith(value => value.elements.pop())],
    ['a duplicated element', guidanceWith(value => (value.elements[5] = { ...value.elements[0] }))],
    [
      'an unknown element',
      guidanceWith(value => (value.elements[0] = { ...value.elements[0], element: 'fee' })),
    ],
    [
      'an unknown status',
      guidanceWith(value => (value.elements[0] = { ...value.elements[0], status: 'valid' })),
    ],
    [
      'an empty gap',
      guidanceWith(value => (value.elements[0] = { ...value.elements[0], gap: '' })),
    ],
    [
      'an oversized gap',
      guidanceWith(value => (value.elements[0] = { ...value.elements[0], gap: 'x'.repeat(1001) })),
    ],
    [
      'an extra element key',
      guidanceWith(value => (value.elements[0] = { ...value.elements[0], excerpt: 'x' })),
    ],
    ['non-array risk notes', guidanceWith(value => (value.risk_notes = {} as never))],
    ['too many risk notes', guidanceWith(value => (value.risk_notes = riskNotes(7)))],
    ['a duplicated risk note', guidanceWith(value => (value.risk_notes = [riskNote, riskNote]))],
    [
      'an unknown risk kind',
      guidanceWith(value => (value.risk_notes = [{ ...riskNote, kind: 'infringement' }])),
    ],
    [
      'an oversized risk note',
      guidanceWith(value => (value.risk_notes = [{ ...riskNote, note: 'x'.repeat(1001) }])),
    ],
    [
      'an extra risk note key',
      guidanceWith(value => (value.risk_notes = [{ ...riskNote, severity: 'high' }])),
    ],
  ])('rejects %s', (_label, guidance) => {
    expect(() => parseCopyrightFormGuidance(guidance)).toThrow('Invalid copyright form guidance')
  })
})
