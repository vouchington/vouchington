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
    expect(
      parseCopyrightSubmissionGuidanceOutput(JSON.stringify(counter), 'counter_notice'),
    ).toEqual(counter)
    expect(
      parseCopyrightSubmissionGuidanceOutput(JSON.stringify(hold), 'court_or_ccb_hold'),
    ).toEqual(hold)
  })

  it.each(['{', 'x'.repeat(64 * 1024 + 1)])('rejects malformed or oversized JSON', text => {
    expect(() => parseCopyrightSubmissionGuidanceOutput(text, 'counter_notice')).toThrow(
      'Invalid copyright submission guidance JSON',
    )
  })

  it.each([
    ['extra decision field', { ...counter, suggested_action: 'accept' }],
    ['missing checklist', { summary: counter.summary, risk_notes: [] }],
    ['repeated element', { ...counter, elements: [counter.elements[0], ...counter.elements] }],
    ['non-object', []],
  ])('rejects %s', (_label, value) => {
    expect(() =>
      parseCopyrightSubmissionGuidanceOutput(JSON.stringify(value), 'counter_notice'),
    ).toThrow('Invalid copyright submission guidance output')
  })

  it('rejects a counter shape as hold guidance', () => {
    expect(() =>
      parseCopyrightSubmissionGuidanceOutput(JSON.stringify(counter), 'court_or_ccb_hold'),
    ).toThrow('Invalid copyright submission guidance output')
  })
})
