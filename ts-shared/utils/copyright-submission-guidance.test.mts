import { describe, expect, it } from 'vitest'
import {
  COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS,
  COPYRIGHT_COUNTER_NOTICE_RISK_KINDS,
  COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA,
  COPYRIGHT_LEGAL_HOLD_RISK_KINDS,
} from './copyright-submission-guidance.mts'

describe('copyright submission guidance vocabulary', () => {
  it('keeps the counter-notice checklist and risk kinds closed and unique', () => {
    expect(COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS).toEqual([
      'signature',
      'material_identification',
      'has_good_faith_statement',
      'contact_and_jurisdiction_consent',
    ])
    expect(COPYRIGHT_COUNTER_NOTICE_RISK_KINDS).toEqual([
      'material_mismatch',
      'good_faith_concern',
      'jurisdiction_consent_gap',
      'abuse_signal',
      'other',
    ])
    expect(new Set(COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS).size).toBe(
      COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS.length,
    )
    expect(new Set(COPYRIGHT_COUNTER_NOTICE_RISK_KINDS).size).toBe(
      COPYRIGHT_COUNTER_NOTICE_RISK_KINDS.length,
    )
  })

  it('keeps the court/CCB checklist and risk kinds closed and unique', () => {
    expect(COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA).toEqual([
      'is_from_original_claimant',
      'proceeding_kind',
      'commenced_at',
      'received_by_designated_agent_at',
      'is_same_material',
    ])
    expect(COPYRIGHT_LEGAL_HOLD_RISK_KINDS).toEqual([
      'claimant_mismatch',
      'proceeding_gap',
      'timing_gap',
      'material_mismatch',
      'other',
    ])
    expect(new Set(COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA).size).toBe(
      COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA.length,
    )
    expect(new Set(COPYRIGHT_LEGAL_HOLD_RISK_KINDS).size).toBe(
      COPYRIGHT_LEGAL_HOLD_RISK_KINDS.length,
    )
  })
})
