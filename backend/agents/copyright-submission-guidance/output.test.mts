import { describe, expect, it } from 'vitest'
import {
  COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS,
  COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA,
} from '@ts-shared/utils/copyright-submission-guidance'
import { parseCopyrightSubmissionGuidanceOutput } from './output.mts'

const counter = {
  summary: 'The filer disputes the identified image restriction.',
  elements: COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS.map(element => ({
    element,
    status: 'present',
    gap: null,
  })),
  risk_notes: [],
}
const hold = {
  summary: 'The filer describes a court proceeding.',
  criteria: COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA.map(criterion => ({
    criterion,
    status: 'unclear',
    gap: 'The filing does not establish this fact.',
  })),
  risk_notes: [],
}

describe('copyright submission guidance model output', () => {
  it('accepts closed advisory checklists for each filing kind', () => {
    expect(parseCopyrightSubmissionGuidanceOutput(counter, 'counter_notice')).toEqual(counter)
    expect(parseCopyrightSubmissionGuidanceOutput(hold, 'court_or_ccb_hold')).toEqual(hold)
  })

  it.each([
    ['extra decision field', { ...counter, suggested_action: 'accept' }],
    ['missing checklist', { summary: counter.summary, risk_notes: [] }],
    ['repeated element', { ...counter, elements: [counter.elements[0], ...counter.elements] }],
    ['non-object', []],
  ])('rejects %s', (_label, value) => {
    expect(() => parseCopyrightSubmissionGuidanceOutput(value, 'counter_notice')).toThrow(
      'Invalid copyright submission guidance output',
    )
  })

  it('rejects a counter shape as hold guidance', () => {
    expect(() => parseCopyrightSubmissionGuidanceOutput(counter, 'court_or_ccb_hold')).toThrow(
      'Invalid copyright submission guidance output',
    )
  })
})
