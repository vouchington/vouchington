import { describe, expect, it } from 'vitest'
import { parseCopyrightLegalHoldGuidance } from './legal-hold-guidance.mts'

type MutableGuidance = Record<string, unknown> & {
  criteria: Array<Record<string, unknown>>
  risk_notes: Array<Record<string, unknown>>
}

const criteria = [
  { criterion: 'from_original_claimant', status: 'present', gap: null },
  { criterion: 'proceeding_kind', status: 'present', gap: null },
  { criterion: 'commenced_at', status: 'present', gap: null },
  { criterion: 'received_by_designated_agent_at', status: 'present', gap: null },
  { criterion: 'same_material', status: 'present', gap: null },
]
const riskNote = { kind: 'claimant_mismatch', note: 'The filing may not come from the notifier.' }

function guidanceWith(change: (guidance: MutableGuidance) => void = () => {}): unknown {
  const guidance = structuredClone({
    summary: 'Review the proceeding facts and the exact material covered.',
    criteria,
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

describe('copyright legal-hold guidance parser', () => {
  it('accepts each required criterion exactly once with bounded risk notes and no action field', () => {
    const guidance = guidanceWith(value => {
      value.criteria[1] = {
        criterion: 'proceeding_kind',
        status: 'unclear',
        gap: 'The record does not establish a qualifying matter.',
      }
      value.criteria[3] = {
        criterion: 'received_by_designated_agent_at',
        status: 'missing',
        gap: null,
      }
      value.risk_notes = riskNotes(6)
    })

    expect(parseCopyrightLegalHoldGuidance(guidance)).toEqual(guidance)
  })

  it('accepts each supported status and null gaps', () => {
    const guidance = guidanceWith(value => {
      value.criteria = [
        { criterion: 'from_original_claimant', status: 'present', gap: null },
        { criterion: 'proceeding_kind', status: 'missing', gap: null },
        { criterion: 'commenced_at', status: 'unclear', gap: null },
        { criterion: 'received_by_designated_agent_at', status: 'present', gap: null },
        { criterion: 'same_material', status: 'present', gap: null },
      ]
    })
    expect(parseCopyrightLegalHoldGuidance(guidance)).toEqual(guidance)
  })

  it.each([
    ['a missing object', null],
    ['an array', []],
    ['a string', 'qualifies'],
    ['an extra top-level key', guidanceWith(value => (value.decision = 'maintain_hold'))],
    ['a missing top-level key', guidanceWith(value => Reflect.deleteProperty(value, 'risk_notes'))],
    ['a suggested action', guidanceWith(value => (value.suggested_action = 'maintain_hold'))],
    ['a blank summary', guidanceWith(value => (value.summary = '   '))],
    ['an oversized summary', guidanceWith(value => (value.summary = 'x'.repeat(2001)))],
    ['a missing criterion', guidanceWith(value => value.criteria.pop())],
    [
      'a duplicated criterion',
      guidanceWith(value => (value.criteria[4] = { ...value.criteria[0] })),
    ],
    [
      'an unknown criterion',
      guidanceWith(
        value => (value.criteria[0] = { ...value.criteria[0], criterion: 'ccb_claim_kind' }),
      ),
    ],
    [
      'an unsupported status',
      guidanceWith(value => (value.criteria[0] = { ...value.criteria[0], status: 'qualifying' })),
    ],
    [
      'an empty gap',
      guidanceWith(value => (value.criteria[0] = { ...value.criteria[0], gap: '' })),
    ],
    [
      'an oversized gap',
      guidanceWith(value => (value.criteria[0] = { ...value.criteria[0], gap: 'x'.repeat(1001) })),
    ],
    [
      'a non-text gap',
      guidanceWith(value => (value.criteria[0] = { ...value.criteria[0], gap: false })),
    ],
    [
      'an extra criterion key',
      guidanceWith(value => (value.criteria[0] = { ...value.criteria[0], evidence: 'private' })),
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
    expect(() => parseCopyrightLegalHoldGuidance(guidance)).toThrow(
      'Invalid copyright legal-hold guidance',
    )
  })
})
