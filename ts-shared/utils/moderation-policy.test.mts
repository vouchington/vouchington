import { describe, expect, it } from 'vitest'
import {
  MODERATION_POLICY,
  MODERATION_REPORT_REASONS,
  MODERATION_REPORT_REASON_OPTIONS,
  CONTENT_POLICY_CATEGORIES,
  CONTENT_POLICY,
  MODERATION_JUDGEMENT_ACTIONS,
  MODERATION_APPEAL_ACTIONS,
  isReportReason,
  isAiCategory,
  hasGuidance,
  getPolicySeverity,
} from './moderation-policy.mts'

describe('moderation policy registry', () => {
  it('every entry has required first-class attributes', () => {
    for (const entry of MODERATION_POLICY) {
      expect(entry).toHaveProperty('key')
      expect(entry).toHaveProperty('label')
      expect(entry).toHaveProperty('severity')
      expect(entry).toHaveProperty('appealEligible')
      expect(entry).toHaveProperty('recommendedAction')
      expect(entry).toHaveProperty('description')
    }
  })

  it('all entries have appealEligible set to true', () => {
    for (const entry of MODERATION_POLICY) {
      expect(entry.appealEligible).toBe(true)
    }
  })

  it('recommendedAction values are all valid judgement actions', () => {
    const validActions = new Set(MODERATION_JUDGEMENT_ACTIONS as readonly string[])
    for (const entry of MODERATION_POLICY) {
      expect(validActions.has(entry.recommendedAction)).toBe(true)
    }
  })

  it('derives MODERATION_REPORT_REASONS from the registry in the original order', () => {
    expect(MODERATION_REPORT_REASONS).toEqual([
      'spam',
      'harassment',
      'misinformation',
      'illegal_content',
      'vote_manipulation',
      'other',
    ])
  })

  it('keeps the catch-all reason last', () => {
    expect(MODERATION_REPORT_REASONS.at(-1)).toBe('other')
  })

  it('derives MODERATION_REPORT_REASON_OPTIONS matching reasons order and labels', () => {
    expect(MODERATION_REPORT_REASON_OPTIONS.map(o => o.value)).toEqual(MODERATION_REPORT_REASONS)
    for (const opt of MODERATION_REPORT_REASON_OPTIONS) {
      expect(typeof opt.label).toBe('string')
      expect(opt.label.length).toBeGreaterThan(0)
    }
  })

  it('derives CONTENT_POLICY_CATEGORIES from the registry in the original order', () => {
    expect(CONTENT_POLICY_CATEGORIES).toEqual([
      'spam',
      'harassment',
      'misinformation',
      'illegal_content',
      'hate_speech',
      'sexual_content',
      'violence',
      'privacy_violation',
      'off_topic',
    ])
  })

  it('derives CONTENT_POLICY with a description for every AI category', () => {
    for (const category of CONTENT_POLICY_CATEGORIES) {
      expect(typeof CONTENT_POLICY[category]).toBe('string')
      expect(CONTENT_POLICY[category].length).toBeGreaterThan(0)
    }
  })

  it('report-only entries (vote_manipulation, other) have guidance field', () => {
    const reportOnlyAiOnly = MODERATION_POLICY.filter(e => e.isReportReason && !e.isAiCategory)
    expect(reportOnlyAiOnly.length).toBeGreaterThan(0)
    for (const entry of reportOnlyAiOnly) {
      expect(hasGuidance(entry)).toBe(true)
    }
  })

  it('isReportReason guard narrows correctly', () => {
    const reasons = MODERATION_POLICY.filter(isReportReason)
    expect(reasons.every(e => e.isReportReason)).toBe(true)
    expect(reasons.map(e => e.key)).toEqual(MODERATION_REPORT_REASONS)
  })

  it('isAiCategory guard narrows correctly', () => {
    const categories = MODERATION_POLICY.filter(isAiCategory)
    expect(categories.every(e => e.isAiCategory)).toBe(true)
    expect(categories.map(e => e.key)).toEqual(CONTENT_POLICY_CATEGORIES)
  })

  it('MODERATION_JUDGEMENT_ACTIONS matches the expected values', () => {
    expect(MODERATION_JUDGEMENT_ACTIONS).toEqual(['no_action', 'warn', 'remove', 'escalate'])
  })

  it('MODERATION_APPEAL_ACTIONS matches the expected values', () => {
    expect(MODERATION_APPEAL_ACTIONS).toEqual(['accept', 'deny', 'reduce'])
  })

  it('getPolicySeverity returns the severity for a known reason and null for unknown', () => {
    expect(getPolicySeverity('illegal_content')).toBe('critical')
    expect(getPolicySeverity('spam')).toBe('low')
    expect(getPolicySeverity('not_a_real_reason')).toBeNull()
  })
})
