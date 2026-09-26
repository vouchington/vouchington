import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type CoverageRules = {
  rules: Array<{
    paths: string
    patch_coverage_min: number
    area?: string
  }>
}

describe('.coverage-rules.yml', () => {
  it('documents static-analysis patch coverage exemption and email template coverage', () => {
    const rules = load(readFileSync('.coverage-rules.yml', 'utf8')) as CoverageRules

    expect(rules.rules).toEqual(
      expect.arrayContaining([
        { paths: 'static-code-analysis/**', patch_coverage_min: 0 },
        { paths: 'email-templates/**', patch_coverage_min: 100, area: 'backend' },
      ]),
    )
  })

  it('requires minimum patch coverage for backend and web workspaces', () => {
    const rules = load(readFileSync('.coverage-rules.yml', 'utf8')) as CoverageRules

    expect(rules.rules).toEqual(
      expect.arrayContaining([
        {
          paths: 'backend/**',
          patch_coverage_min: 95,
          area: 'backend',
        },
        {
          paths: 'web/**',
          patch_coverage_min: 80,
          area: 'web',
        },
      ]),
    )
  })

  it('requires full patch coverage for the cloudflare-worker workspace', () => {
    const rules = load(readFileSync('.coverage-rules.yml', 'utf8')) as CoverageRules

    expect(rules.rules).toEqual(
      expect.arrayContaining([
        {
          paths: 'cloudflare-worker/**',
          patch_coverage_min: 100,
          area: 'cloudflare-worker',
        },
      ]),
    )
  })

  it('exempts backend scripts before the broader backend rule', () => {
    const rules = load(readFileSync('.coverage-rules.yml', 'utf8')) as CoverageRules

    const scriptRuleIndex = rules.rules.findIndex(rule => rule.paths === 'backend/scripts/**')
    const backendRuleIndex = rules.rules.findIndex(rule => rule.paths === 'backend/**')

    expect(scriptRuleIndex).toBeGreaterThanOrEqual(0)
    expect(rules.rules[scriptRuleIndex]).toEqual({
      paths: 'backend/scripts/**',
      patch_coverage_min: 0,
    })
    expect(backendRuleIndex).toBeGreaterThan(scriptRuleIndex)
  })

  it('contains patch thresholds only', () => {
    const rules = load(readFileSync('.coverage-rules.yml', 'utf8')) as CoverageRules

    for (const rule of rules.rules) {
      expect(rule).toHaveProperty('patch_coverage_min')
      expect(rule).not.toHaveProperty('no_coverage_drop')
      expect(rule).not.toHaveProperty('max_coverage_drop')
    }
  })
})
