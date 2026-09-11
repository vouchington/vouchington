import { beforeAll, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import {
  createReferralProgramLinkValidation,
  createReferralProgramLinkValidationRule,
} from '@voucha/test-helpers'
import { getReferralLinkValidationRule, getReferralLinkValidationRules } from './get.mts'

describe('get', () => {
  let validationId: string | null = null
  let ruleId1: string | null = null
  let ruleId2: string | null = null

  beforeAll(async () => {
    const randomSuffix = Math.random().toString(36).slice(7)

    validationId = await createReferralProgramLinkValidation(`test_validation_${randomSuffix}`)
    ruleId1 = await createReferralProgramLinkValidationRule({
      validationId: validationId!,
      hostname: 'example.com',
      pathname: '/refer',
    })
    ruleId2 = await createReferralProgramLinkValidationRule({
      validationId: validationId!,
      hostname: '*.example.com',
      pathname: '/r/%',
    })
  })

  it('getReferralLinkValidationRule returns rule by ID', async () => {
    const rule = await getReferralLinkValidationRule(ruleId1!)

    assert.ok(rule)
    assert.equal(rule.id, ruleId1)
    assert.equal(rule.hostname, 'example.com')
    assert.equal(rule.pathname, '/refer')
    assert.equal(rule.is_referral_link_url, true)
  })

  it('getReferralLinkValidationRule returns null for non-existent ID', async () => {
    const rule = await getReferralLinkValidationRule('00000000-0000-0000-0000-000000000000')

    assert.equal(rule, null)
  })

  it('getReferralLinkValidationRules returns all rules for validation', async () => {
    const result = await getReferralLinkValidationRules(validationId!)

    assert.ok(result.results.length >= 2)
    const ruleIds = new Set(result.results.map(r => r.id))
    assert.ok(ruleIds.has(ruleId1!))
    assert.ok(ruleIds.has(ruleId2!))
  })

  it('getReferralLinkValidationRules orders by specificity', async () => {
    const result = await getReferralLinkValidationRules(validationId!)

    assert.ok(result.results.length >= 2)
    const exactHostnameIndex = result.results.findIndex(r => r.hostname === 'example.com')
    const wildcardHostnameIndex = result.results.findIndex(r => r.hostname === '*.example.com')

    assert.ok(
      exactHostnameIndex < wildcardHostnameIndex,
      'Exact hostname should come before wildcard',
    )
  })

  it('getReferralLinkValidationRules respects limit parameter', async () => {
    const result = await getReferralLinkValidationRules(validationId!, { limit: 1 })

    assert.equal(result.results.length, 1)
  })
})
