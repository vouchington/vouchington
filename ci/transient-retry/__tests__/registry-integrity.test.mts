import { unregisteredRules } from '../rule-registry-policy.mts'

import { describe, expect, it } from 'vitest'

import { RULES } from '../rules.mts'

describe('RULES registry integrity', () => {
  it('requires every discovered exported rule by identity and nonempty discovery', () => {
    const rule = { id: 'fixture', match: () => true }
    expect(unregisteredRules([{ rule, unrelated: {}, value: null }], [rule])).toEqual([])
    expect(unregisteredRules([{ rule }], [{ ...rule }])).toEqual([
      'rule "fixture" is exported but missing from the RULES array',
    ])
    expect(unregisteredRules([{ value: null, other: {} }], [])).toEqual([
      'No exported retry rules discovered',
    ])
  })

  it('every rule id in RULES is unique', () => {
    const seen = new Set<string>()
    for (const rule of RULES) {
      if (seen.has(rule.id)) throw new Error(`duplicate rule id "${rule.id}"`)
      seen.add(rule.id)
    }
    expect(seen.size).toBe(RULES.length)
  })

  it('every consumer and root-cause pair is unique', () => {
    const seen = new Set<string>()
    for (const rule of RULES) {
      const key = `${rule.consumerKey}\u0000${rule.rootCauseKey}`
      if (seen.has(key)) {
        throw new Error(
          `duplicate consumer/root-cause pair "${rule.consumerKey}" / "${rule.rootCauseKey}"`,
        )
      }
      seen.add(key)
    }
    expect(seen.size).toBe(RULES.length)
  })

  it('every RULES entry has the required shape fields', () => {
    for (const rule of RULES) {
      const ctx = `rule "${rule.id}"`
      if (typeof rule.id !== 'string' || rule.id.length === 0)
        throw new Error(`${ctx}: id must be a non-empty string`)
      if (typeof rule.description !== 'string' || rule.description.length === 0)
        throw new Error(`${ctx}: description must be a non-empty string`)
      if (typeof rule.rationale !== 'string' || rule.rationale.length === 0)
        throw new Error(`${ctx}: rationale must be a non-empty string`)
      if (typeof rule.consumerKey !== 'string' || rule.consumerKey.length === 0)
        throw new Error(`${ctx}: consumerKey must be a non-empty string`)
      if (typeof rule.rootCauseKey !== 'string' || rule.rootCauseKey.length === 0)
        throw new Error(`${ctx}: rootCauseKey must be a non-empty string`)
      if (rule.consumerKey === rule.id || rule.rootCauseKey === rule.id)
        throw new Error(`${ctx}: consumerKey and rootCauseKey must describe semantic families`)
      if (typeof rule.maxAttempts !== 'number')
        throw new Error(`${ctx}: maxAttempts must be a number`)
      if (typeof rule.match !== 'function') throw new Error(`${ctx}: match must be a function`)
    }
    // At least one rule must exist to confirm the loop ran.
    expect(RULES.length).toBeGreaterThan(0)
  })
})
