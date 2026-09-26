#!/usr/bin/env node
// coverage-area-rules.mts — prints .coverage-rules.yml as one area workflow's coverage gate sees it.
//
// Each area workflow uploads LCOV only from its own suites, so its gate can enforce only the
// positive-threshold rules that name it as their `area`. Every other positive rule is zeroed in
// place: first-match order is kept, so a narrower rule owned by another area still shadows a broader
// rule owned by this one (lambdas/dev-server.mts is covered by the tooling area's portability suite,
// not by the lambdas suite).
import { readFileSync } from 'node:fs'

import { parse, stringify } from 'yaml'

export const coverageAreas = ['backend', 'web', 'cloudflare-worker', 'lambdas', 'tooling'] as const
export type CoverageArea = (typeof coverageAreas)[number]

type CoverageRule = { paths: string; patch_coverage_min: number; area?: string }
type CoverageRules = { rules: CoverageRule[] } & Record<string, unknown>

export function isCoverageArea(value: unknown): value is CoverageArea {
  return coverageAreas.some(area => area === value)
}

/** Throws unless every positive-threshold rule names exactly one known owning area. */
export function assertRuleOwners(config: CoverageRules): void {
  for (const rule of config.rules) {
    if (rule.patch_coverage_min > 0 && !isCoverageArea(rule.area)) {
      throw new Error(
        `${rule.paths}: a positive patch_coverage_min needs an area (${coverageAreas.join(', ')})`,
      )
    }
    if (rule.patch_coverage_min === 0 && rule.area !== undefined) {
      throw new Error(`${rule.paths}: a zero-threshold rule blocks no area, so it takes no area`)
    }
  }
}

export function areaCoverageRules(config: CoverageRules, area: CoverageArea): CoverageRules {
  assertRuleOwners(config)
  return {
    ...config,
    rules: config.rules.map(({ paths, patch_coverage_min, area: owner }) => ({
      paths,
      patch_coverage_min: owner === area ? patch_coverage_min : 0,
    })),
  }
}

if (import.meta.main) {
  const area = process.argv[2]
  if (!isCoverageArea(area)) {
    console.error(`Usage: coverage-area-rules.mts <${coverageAreas.join('|')}>`)
    process.exit(2)
  }
  const config = parse(readFileSync('.coverage-rules.yml', 'utf8')) as CoverageRules
  process.stdout.write(stringify(areaCoverageRules(config, area)))
}
