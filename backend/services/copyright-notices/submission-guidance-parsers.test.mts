import { describe, expect, it } from 'vitest'
import { parseCopyrightCounterNoticeGuidance } from './counter-notice-guidance.mts'
import { parseCopyrightLegalHoldGuidance } from './legal-hold-guidance.mts'

type MutableGuidance = Record<string, unknown> & {
  risk_notes: Array<Record<string, unknown>>
}
const contracts = [
  {
    name: 'counter-notice',
    parse: parseCopyrightCounterNoticeGuidance,
    listKey: 'elements',
    itemKey: 'element',
    checklist: [
      'signature',
      'material_identification',
      'good_faith_statement',
      'contact_and_jurisdiction_consent',
    ],
    riskKind: 'material_mismatch',
    error: 'Invalid copyright counter-notice guidance',
  },
  {
    name: 'legal-hold',
    parse: parseCopyrightLegalHoldGuidance,
    listKey: 'criteria',
    itemKey: 'criterion',
    checklist: [
      'from_original_claimant',
      'proceeding_kind',
      'commenced_at',
      'received_by_designated_agent_at',
      'same_material',
    ],
    riskKind: 'claimant_mismatch',
    error: 'Invalid copyright legal-hold guidance',
  },
]

const riskNotes = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    kind: 'other',
    note: `Distinct staff review note ${index}.`,
  }))

describe.each(contracts)('copyright $name guidance parser', contract => {
  function guidanceWith(change: (value: MutableGuidance) => void = () => {}): MutableGuidance {
    const value: MutableGuidance = {
      summary: 'Review the statutory statements and the exact material covered.',
      [contract.listKey]: contract.checklist.map(item => ({
        [contract.itemKey]: item,
        status: 'present',
        gap: null,
      })),
      risk_notes: [],
    }
    change(value)
    return value
  }
  function checklist(value: MutableGuidance): Array<Record<string, unknown>> {
    return value[contract.listKey] as Array<Record<string, unknown>>
  }
  const riskNote = { kind: contract.riskKind, note: 'The record needs staff comparison.' }

  it('accepts the exact statutory checklist, all statuses, and bounded staff-only notes', () => {
    const guidance = guidanceWith(value => {
      checklist(value)[1] = {
        [contract.itemKey]: contract.checklist[1],
        status: 'unclear',
        gap: 'Needs staff comparison.',
      }
      checklist(value)[3] = {
        [contract.itemKey]: contract.checklist[3],
        status: 'missing',
        gap: null,
      }
      value.risk_notes = riskNotes(6)
    })
    expect(contract.parse(guidance)).toEqual(guidance)
  })
  it('accepts supported statuses with null gaps', () => {
    const guidance = guidanceWith(value => {
      checklist(value)[1]!.status = 'missing'
      checklist(value)[2]!.status = 'unclear'
    })
    expect(contract.parse(guidance)).toEqual(guidance)
  })
  it.each([
    ['a missing object', null],
    ['an array', []],
    ['a string', 'restore'],
    [
      'an extra top-level key',
      guidanceWith(value => {
        value.decision = 'restore'
      }),
    ],
    [
      'a missing top-level key',
      guidanceWith(value => {
        Reflect.deleteProperty(value, 'risk_notes')
      }),
    ],
    [
      'a suggested action',
      guidanceWith(value => {
        value.suggested_action = 'approve'
      }),
    ],
    [
      'a blank summary',
      guidanceWith(value => {
        value.summary = '   '
      }),
    ],
    [
      'an oversized summary',
      guidanceWith(value => {
        value.summary = 'x'.repeat(2001)
      }),
    ],
    [
      'a missing checklist item',
      guidanceWith(value => {
        checklist(value).pop()
      }),
    ],
    [
      'a duplicated checklist item',
      guidanceWith(value => {
        checklist(value)[3] = { ...checklist(value)[0] }
      }),
    ],
    [
      'an unknown checklist item',
      guidanceWith(value => {
        checklist(value)[0]![contract.itemKey] = 'unknown_statutory_item'
      }),
    ],
    [
      'an unsupported status',
      guidanceWith(value => {
        checklist(value)[0]!.status = 'compliant'
      }),
    ],
    [
      'an empty gap',
      guidanceWith(value => {
        checklist(value)[0]!.gap = ''
      }),
    ],
    [
      'an oversized gap',
      guidanceWith(value => {
        checklist(value)[0]!.gap = 'x'.repeat(1001)
      }),
    ],
    [
      'a non-text gap',
      guidanceWith(value => {
        checklist(value)[0]!.gap = false
      }),
    ],
    [
      'an extra checklist key',
      guidanceWith(value => {
        checklist(value)[0]!.evidence = 'private'
      }),
    ],
    [
      'non-array risk notes',
      guidanceWith(value => {
        value.risk_notes = {} as never
      }),
    ],
    [
      'more than six risk notes',
      guidanceWith(value => {
        value.risk_notes = riskNotes(7)
      }),
    ],
    [
      'a duplicate risk note',
      guidanceWith(value => {
        value.risk_notes = [riskNote, riskNote]
      }),
    ],
    [
      'an unknown risk kind',
      guidanceWith(value => {
        value.risk_notes = [{ ...riskNote, kind: 'legal_conclusion' }]
      }),
    ],
    [
      'an empty risk note',
      guidanceWith(value => {
        value.risk_notes = [{ ...riskNote, note: '   ' }]
      }),
    ],
    [
      'an oversized risk note',
      guidanceWith(value => {
        value.risk_notes = [{ ...riskNote, note: 'x'.repeat(1001) }]
      }),
    ],
    [
      'an extra risk-note key',
      guidanceWith(value => {
        value.risk_notes = [{ ...riskNote, severity: 'high' }]
      }),
    ],
  ])('rejects %s', (_label, guidance) => {
    expect(() => contract.parse(guidance)).toThrow(contract.error)
  })
})
