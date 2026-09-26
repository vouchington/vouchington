import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

import { areaCoverageRules, assertRuleOwners, coverageAreas } from './coverage-area-rules.mts'

type Rule = { paths: string; patch_coverage_min: number; area?: string }
type Rules = { rules: Rule[] } & Record<string, unknown>

const repoRules = parse(readFileSync('.coverage-rules.yml', 'utf8')) as Rules

describe('coverage-area-rules', () => {
  it('gives every positive repository rule exactly one known owning area', () => {
    expect(() => assertRuleOwners(repoRules)).not.toThrow()
    const owners = new Set(repoRules.rules.flatMap(rule => (rule.area ? [rule.area] : [])))
    expect([...owners].sort()).toEqual([...coverageAreas].sort())
  })

  it.each(coverageAreas)('keeps only %s-owned thresholds, in first-match order', area => {
    const result = areaCoverageRules(repoRules, area)

    expect(result.scope).toEqual(repoRules.scope)
    expect(result.rules.map(rule => rule.paths)).toEqual(repoRules.rules.map(rule => rule.paths))
    expect(result.rules).toEqual(
      repoRules.rules.map(rule => ({
        paths: rule.paths,
        patch_coverage_min: rule.area === area ? rule.patch_coverage_min : 0,
      })),
    )
  })

  it('lets a narrower rule owned by another area shadow a broader owned rule', () => {
    const config = {
      rules: [
        { paths: 'lambdas/dev-server.mts', patch_coverage_min: 100, area: 'tooling' },
        { paths: 'lambdas/**', patch_coverage_min: 100, area: 'lambdas' },
      ],
    }

    expect(areaCoverageRules(config, 'lambdas').rules).toEqual([
      { paths: 'lambdas/dev-server.mts', patch_coverage_min: 0 },
      { paths: 'lambdas/**', patch_coverage_min: 100 },
    ])
  })

  it.each([
    ['a positive rule without an area', { paths: 'web/**', patch_coverage_min: 80 }],
    [
      'a positive rule with an unknown area',
      { paths: 'web/**', patch_coverage_min: 80, area: 'docs' },
    ],
    ['a zero rule with an area', { paths: 'web/mocks/**', patch_coverage_min: 0, area: 'web' }],
  ])('rejects %s', (_label, rule) => {
    expect(() => areaCoverageRules({ rules: [rule] }, 'web')).toThrow(rule.paths)
  })

  it('prints the area rules as YAML and rejects an unknown area on the CLI', () => {
    const printed = spawnSync(process.execPath, ['ci/coverage-area-rules.mts', 'lambdas'], {
      encoding: 'utf8',
    })
    expect(printed.status).toBe(0)
    expect(parse(printed.stdout)).toEqual(areaCoverageRules(repoRules, 'lambdas'))

    const rejected = spawnSync(process.execPath, ['ci/coverage-area-rules.mts', 'docs'], {
      encoding: 'utf8',
    })
    expect(rejected.status).toBe(2)
    expect(rejected.stdout).toBe('')
  })
})
