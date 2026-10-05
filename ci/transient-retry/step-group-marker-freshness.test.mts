import { readdirSync, readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import {
  cloudflareWorkerTscStepMarker,
  oxlintTypeAwareStepMarker,
} from './static-analysis-log-fingerprints.mts'
import { buildWebTargetsStepMarker } from './runner-shutdown-consumer-registry.mts'

// Guards the `##[group]Run <run:|uses:>` step-header class of marker against silent staleness — see
// static-analysis-log-fingerprints.mts for the incidents this closes (PR #10604).
// sliceGithubActionsStepGroup() slices a log by exact-substring indexOf(); a marker that
// no longer matches any step header makes its rule decline to match forever, and a marker that is only
// a prefix of a sibling step's header would silently slice the wrong step.
//
// Table A covers markers whose source of truth is a `run:` or local `uses:` step in this repo's own
// YAML.

interface YamlStep {
  run?: unknown
  uses?: unknown
}
interface YamlWorkflow {
  jobs?: Record<string, { steps?: YamlStep[] }>
  runs?: { steps?: YamlStep[] }
}

// Groups `run:` and local `uses:` step headers by job, matching GitHub's per-job log boundary.
// A reusable workflow can invoke the same action in distinct jobs without making log slicing
// ambiguous. `split('\n')[0]` is correct for all three `run:` scalar styles: a `>-` folded block is already
// one space-joined line after `parse()`, a `|` literal block echoes only its first line in the header,
// and a plain scalar is unaffected by the split. A local `uses:` value is already one action path.
function stepHeaderGroups(yamlPath: string): string[][] {
  const parsed = load(readFileSync(new URL(yamlPath, import.meta.url), 'utf8')) as YamlWorkflow
  const jobSteps = parsed.runs?.steps
    ? [parsed.runs.steps]
    : Object.values(parsed.jobs ?? {}).map(job => job.steps ?? [])
  return jobSteps.map(steps =>
    steps.flatMap(step => {
      if (typeof step.run === 'string') return [`##[group]Run ${step.run.split('\n')[0]}`]
      if (typeof step.uses === 'string' && step.uses.startsWith('./')) {
        return [`##[group]Run ${step.uses}`]
      }
      return []
    }),
  )
}

const externalActionWorkflowRoots = [
  '../../.github/workflows/',
  '../../.github/actions/',
  '../../ci/no-mistakes-workflows/',
]

function collectExternalActionUsesPrefixes(moduleUrl: string): Set<string> {
  const prefixes = new Set<string>()
  for (const relativeRoot of externalActionWorkflowRoots) {
    addExternalActionUsesPrefixes(new URL(relativeRoot, moduleUrl), prefixes)
  }
  return prefixes
}

function addExternalActionUsesPrefixes(directory: URL, prefixes: Set<string>): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      addExternalActionUsesPrefixes(new URL(`${entry.name}/`, directory), prefixes)
      continue
    }
    if (!entry.name.endsWith('.yml') && !entry.name.endsWith('.yaml')) continue
    const contents = readFileSync(new URL(entry.name, directory), 'utf8')
    for (const match of contents.matchAll(/^[ \t]*(?:-[ \t]+)?uses:[ \t]+([^ \t#]+)@/gm)) {
      const action = match[1]
      if (action !== undefined && !action.startsWith('./')) prefixes.add(`${action}@`)
    }
  }
}

// Freshness + no duplicate: the expected jobs must contain a marker, and at most one step per job
// may match it. Two identical `run:`
// steps would both satisfy `header !== marker` as false and so both get excluded from the prefix
// check below, silently passing uniqueness even though sliceGithubActionsStepGroup()'s indexOf()
// always slices the first occurrence — a failure in the second, identical step would go unseen
// (flagged by @chatgpt-codex-connector on PR #10604).
//
// Uniqueness: no OTHER step's header in that job may start with it — a shorter marker that is only
// a prefix of a sibling's header would make indexOf() match the first (wrong) occurrence. A real
// job log concatenates its workflow steps and every composite action it invokes, so a cross-file
// collision remains out of this check's reach.
function assertMarkerIsFreshAndUnique(
  marker: string,
  yamlPath: string,
  expectedJobCount = 1,
): void {
  const groups = stepHeaderGroups(yamlPath)
  expect(groups.filter(headers => headers.includes(marker))).toHaveLength(expectedJobCount)
  for (const headers of groups) {
    const exactMatches = headers.filter(header => header === marker)
    expect(exactMatches.length).toBeLessThanOrEqual(1)
    const prefixCollisions = headers.filter(
      header => header !== marker && header.startsWith(marker),
    )
    expect(prefixCollisions).toEqual([])
  }
}

describe('step-group-marker-freshness', () => {
  describe('YAML step headers (Table A)', () => {
    it('Cloudflare Worker tsc marker matches static-code-analysis.yml', () => {
      assertMarkerIsFreshAndUnique(
        cloudflareWorkerTscStepMarker,
        '../../.github/workflows/static-code-analysis.yml',
      )
    })

    it.each([
      ['checks-static.yml', '../../.github/workflows/checks-static.yml', 1],
      ['tests-playwright.yml', '../../.github/workflows/tests-playwright.yml', 2],
      [
        'tests-playwright-credentialed.yml',
        '../../.github/workflows/tests-playwright-credentialed.yml',
        1,
      ],
      ['tests-web-integration.yml', '../../.github/workflows/tests-web-integration.yml', 2],
    ])('build-web-targets marker matches %s', (_workflowName, yamlPath, expectedJobCount) => {
      assertMarkerIsFreshAndUnique(buildWebTargetsStepMarker, yamlPath, expectedJobCount)
    })

    it('oxlint type-aware marker matches static-code-analysis.yml', () => {
      assertMarkerIsFreshAndUnique(
        oxlintTypeAwareStepMarker,
        '../../.github/workflows/static-code-analysis.yml',
      )
    })

    it('flags a marker that is only a prefix of a sibling step header', () => {
      // Synthetic fixture, not a real workflow file — proves the uniqueness half of the guard can
      // actually fail, independent of whether any single repo file happens to collide today.
      const headers = ['##[group]Run pnpm build', '##[group]Run pnpm build:web']
      const marker = '##[group]Run pnpm build'

      const collidingSiblings = headers.filter(
        header => header !== marker && header.startsWith(marker),
      )
      expect(collidingSiblings).not.toEqual([])
    })

    it('flags a marker that matches two identical sibling step headers', () => {
      // Synthetic fixture — proves the exact-duplicate half of the guard can actually fail.
      // Two identical `run:` steps both satisfy `header !== marker` as false, so the prefix-collision
      // filter alone would report zero colliding siblings even though indexOf() can only ever slice
      // the first of the two (flagged by @chatgpt-codex-connector on PR #10604).
      const headers = ['##[group]Run pnpm build', '##[group]Run pnpm build']
      const marker = '##[group]Run pnpm build'

      const exactMatches = headers.filter(header => header === marker)
      expect(exactMatches).not.toHaveLength(1)
    })
  })

  describe('Table A completeness', () => {
    // Every '##[group]Run ' literal declared anywhere in this directory's *.mts sources must be one
    // of the markers asserted above — so adding a new step-header marker with no guard row fails
    // this test instead of failing silently the way the original PR #10604 markers did.
    // A third-party action header is only a prefix ending in `@`. Table A checks exact repo-owned
    // `run:` and local `uses:` steps, so that prefix is accepted while a workflow still invokes it.
    const tableAMarkers = new Set([
      cloudflareWorkerTscStepMarker,
      oxlintTypeAwareStepMarker,
      buildWebTargetsStepMarker,
    ])

    const sourceDir = new URL('.', import.meta.url)
    const markerLiteralPattern = /'(##\[group\]Run [^']*)'/g
    const stepGroupRunPrefix = '##[group]Run '
    const externalActionUsesPrefixes = collectExternalActionUsesPrefixes(import.meta.url)

    it('every declared ##[group]Run marker is covered by Table A', () => {
      const uncovered: string[] = []

      for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.mts') || entry.name.endsWith('.test.mts')) {
          continue
        }

        const contents = readFileSync(new URL(entry.name, sourceDir), 'utf8')
        for (const match of contents.matchAll(markerLiteralPattern)) {
          const marker = match[1]
          if (marker === undefined || tableAMarkers.has(marker)) continue
          const actionPrefix = marker.startsWith(stepGroupRunPrefix)
            ? marker.slice(stepGroupRunPrefix.length)
            : ''
          if (actionPrefix.endsWith('@') && externalActionUsesPrefixes.has(actionPrefix)) continue
          uncovered.push(`${entry.name}: ${marker}`)
        }
      }

      expect(uncovered).toEqual([])
    })
  })
})
