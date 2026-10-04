import { describe, expect, it } from 'vitest'
import { parseCopyrightCounterNoticeGuidance } from './counter-notice-guidance.mts'

type MutableGuidance = Record<string, unknown> & {
  elements: Array<Record<string, unknown>>
  risk_notes: Array<Record<string, unknown>>
}

const elements = [
  { element: 'signature', status: 'present', gap: null },
  { element: 'material_identification', status: 'present', gap: null },
  { element: 'good_faith_statement', status: 'present', gap: null },
  { element: 'contact_and_jurisdiction_consent', status: 'present', gap: null },
]
const riskNote = { kind: 'material_mismatch', note: 'Target and description may differ.' }

function guidanceWith(change: (guidance: MutableGuidance) => void = () => {}): unknown {
  const guidance = structuredClone({
    summary: 'Review the statutory statements and the listed targets.',
    elements,
    risk_notes: [],
  }) as MutableGuidance
  change(guidance)
  return guidance
}

const riskNotes = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    kind: 'other',
    note: `Distinct staff review note ${index}.`,
  }))

describe('copyright counter-notice guidance parser', () => {
  it('accepts each required element exactly once with bounded risk notes and no action field', () => {
    const guidance = guidanceWith(value => {
      value.elements[1] = {
        element: 'material_identification',
        status: 'unclear',
        gap: 'The referenced target needs staff comparison.',
      }
      value.elements[3] = {
        element: 'contact_and_jurisdiction_consent',
        status: 'missing',
        gap: null,
      }
      value.risk_notes = riskNotes(6)
    })

    expect(parseCopyrightCounterNoticeGuidance(guidance)).toEqual(guidance)
  })

  it('accepts each supported status and null gaps', () => {
    const guidance = guidanceWith(value => {
      value.elements = [
        { element: 'signature', status: 'present', gap: null },
        { element: 'material_identification', status: 'missing', gap: null },
        { element: 'good_faith_statement', status: 'unclear', gap: null },
        { element: 'contact_and_jurisdiction_consent', status: 'present', gap: null },
      ]
    })
    expect(parseCopyrightCounterNoticeGuidance(guidance)).toEqual(guidance)
  })

  it.each([
    ['a missing object', null],
    ['an array', []],
    ['a string', 'reverse'],
    ['an extra top-level key', guidanceWith(value => (value.decision = 'restore'))],
    ['a missing top-level key', guidanceWith(value => Reflect.deleteProperty(value, 'risk_notes'))],
    ['a suggested action', guidanceWith(value => (value.suggested_action = 'approve'))],
    ['a blank summary', guidanceWith(value => (value.summary = '   '))],
    ['an oversized summary', guidanceWith(value => (value.summary = 'x'.repeat(2001)))],
    ['a missing element', guidanceWith(value => value.elements.pop())],
    ['a duplicated element', guidanceWith(value => (value.elements[3] = { ...value.elements[0] }))],
    [
      'an unknown element',
      guidanceWith(
        value => (value.elements[0] = { ...value.elements[0], element: 'notice_validity' }),
      ),
    ],
    [
      'an unsupported status',
      guidanceWith(value => (value.elements[0] = { ...value.elements[0], status: 'compliant' })),
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
      'a non-text gap',
      guidanceWith(value => (value.elements[0] = { ...value.elements[0], gap: false })),
    ],
    [
      'an extra element key',
      guidanceWith(value => (value.elements[0] = { ...value.elements[0], evidence: 'private' })),
    ],
    ['non-array risk notes', guidanceWith(value => (value.risk_notes = {} as never))],
    ['more than six risk notes', guidanceWith(value => (value.risk_notes = riskNotes(7)))],
    ['a duplicate risk note', guidanceWith(value => (value.risk_notes = [riskNote, riskNote]))],
    [
      'an unknown risk kind',
      guidanceWith(value => (value.risk_notes = [{ ...riskNote, kind: 'legal_conclusion' }])),
    ],
    [
      'an empty risk note',
      guidanceWith(value => (value.risk_notes = [{ ...riskNote, note: '   ' }])),
    ],
    [
      'an oversized risk note',
      guidanceWith(value => (value.risk_notes = [{ ...riskNote, note: 'x'.repeat(1001) }])),
    ],
    [
      'an extra risk-note key',
      guidanceWith(value => (value.risk_notes = [{ ...riskNote, severity: 'high' }])),
    ],
  ])('rejects %s', (_label, guidance) => {
    expect(() => parseCopyrightCounterNoticeGuidance(guidance)).toThrow(
      'Invalid copyright counter-notice guidance',
    )
  })
})
