import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { cleanWorkspaceScriptStepMarker } from './clean-workspace-rules.mts'
import {
  hostLockAcquireTimeoutMarker,
  hostLockProcessGroupSurvivedSigkillMarker,
  hostLockRanUnlockedSuffix,
} from './host-lock-fingerprints.mts'
import { aptLockWaitTimeoutMarker } from './playwright-log-fingerprints.mts'
import {
  cloudflareWorkerTscStepMarker,
  oxlintTypeAwareStepMarker,
} from './static-analysis-log-fingerprints.mts'
import { buildWebTargetsStepMarker } from './web-build-watchdog-fingerprints.mts'

// Guards the `##[group]Run <run:|uses:>` step-header class of marker against silent staleness — see
// clean-workspace-rules.mts and static-analysis-log-fingerprints.mts for the incidents this closes
// (PR #10604). sliceGithubActionsStepGroup() slices a log by exact-substring indexOf(); a marker that
// no longer matches any step header makes its rule decline to match forever, and a marker that is only
// a prefix of a sibling step's header would silently slice the wrong step.
//
// Table A covers markers whose source of truth is a `run:` or local `uses:` step in this repo's own
// YAML. Table B covers markers emitted by a script packaged in an external dependency, where a
// version bump can break the marker with no diff in this repo at all.

const require = createRequire(import.meta.url)

interface YamlStep {
  run?: unknown
  uses?: unknown
}
interface YamlWorkflow {
  jobs?: Record<string, { steps?: YamlStep[] }>
  runs?: { steps?: YamlStep[] }
}

// Enumerates every `run:` or local `uses:` step in a workflow (`jobs.*.steps[]`) or composite action
// (`runs.steps[]`) and reconstructs the exact GitHub Actions step-header text GitHub would emit for
// it. `split('\n')[0]` is correct for all three `run:` scalar styles: a `>-` folded block is already
// one space-joined line after `parse()`, a `|` literal block echoes only its first line in the header,
// and a plain scalar is unaffected by the split. A local `uses:` value is already one action path.
function stepHeaders(yamlPath: string): string[] {
  const parsed = load(readFileSync(new URL(yamlPath, import.meta.url), 'utf8')) as YamlWorkflow
  const steps =
    parsed.runs?.steps ?? Object.values(parsed.jobs ?? {}).flatMap(job => job.steps ?? [])

  return steps.flatMap(step => {
    if (typeof step.run === 'string') return [`##[group]Run ${step.run.split('\n')[0]}`]
    if (typeof step.uses === 'string' && step.uses.startsWith('./')) {
      return [`##[group]Run ${step.uses}`]
    }
    return []
  })
}

// Freshness + no duplicate: exactly one step's header may equal the marker. Two identical `run:`
// steps would both satisfy `header !== marker` as false and so both get excluded from the prefix
// check below, silently passing uniqueness even though sliceGithubActionsStepGroup()'s indexOf()
// always slices the first occurrence — a failure in the second, identical step would go unseen
// (flagged by @chatgpt-codex-connector on PR #10604).
//
// Uniqueness: no OTHER step's header may start with it — a shorter marker that is only a prefix of
// a sibling's header would make indexOf() match the first (wrong) occurrence. Both checks are scoped
// to this one file only: a real job log concatenates steps from the workflow AND every composite
// action it invokes, so a cross-file collision is out of this check's reach.
function assertMarkerIsFreshAndUnique(marker: string, yamlPath: string): void {
  const headers = stepHeaders(yamlPath)

  const exactMatches = headers.filter(header => header === marker)
  expect(exactMatches).toHaveLength(1)

  const prefixCollisions = headers.filter(header => header !== marker && header.startsWith(marker))
  expect(prefixCollisions).toEqual([])
}

describe('step-group-marker-freshness', () => {
  describe('YAML step headers (Table A)', () => {
    it('clean-workspace composite action marker matches action.yml', () => {
      assertMarkerIsFreshAndUnique(
        cleanWorkspaceScriptStepMarker,
        '../../.github/actions/clean-workspace/action.yml',
      )
    })

    it('Cloudflare Worker tsc marker matches checks-static.yml', () => {
      assertMarkerIsFreshAndUnique(
        cloudflareWorkerTscStepMarker,
        '../../.github/workflows/checks-static.yml',
      )
    })

    it.each([
      ['checks-static.yml', '../../.github/workflows/checks-static.yml'],
      ['tests-playwright.yml', '../../.github/workflows/tests-playwright.yml'],
      [
        'tests-playwright-credentialed.yml',
        '../../.github/workflows/tests-playwright-credentialed.yml',
      ],
      ['tests-web-integration.yml', '../../.github/workflows/tests-web-integration.yml'],
    ])('build-web-targets marker matches %s', (_workflowName, yamlPath) => {
      assertMarkerIsFreshAndUnique(buildWebTargetsStepMarker, yamlPath)
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

  describe('script-emitted markers (Table B)', () => {
    it('host-lock SIGKILL-survivor marker matches the packaged vouchington-tooling script', () => {
      const scriptPath = join(
        dirname(require.resolve('vouchington-tooling/package.json')),
        'scripts/host-lock/with-host-lock.sh',
      )
      const script = readFileSync(scriptPath, 'utf8')

      // The package emits the lock name via `$name`; require the full source-side template plus
      // the shared terminal fragment used against runtime output.
      expect(script).toContain(`with-host-lock: $name ${hostLockProcessGroupSurvivedSigkillMarker}`)
    })

    it('apt-lock timeout marker matches the packaged vouchington-tooling script', () => {
      const scriptPath = join(
        dirname(require.resolve('vouchington-tooling/package.json')),
        'scripts/gha/wait-for-apt-locks.sh',
      )
      const script = readFileSync(scriptPath, 'utf8')

      // Imports the real constant hasPlaywrightSetupAptLockFailure matches against, rather than a
      // literal only this test owns — otherwise the marker could drift in
      // playwright-log-fingerprints.mts with this row staying green (see PR #10604).
      expect(script).toContain(aptLockWaitTimeoutMarker)
    })

    it('host-lock acquire-timeout markers match the packaged vouchington-tooling script', () => {
      const scriptPath = join(
        dirname(require.resolve('vouchington-tooling/package.json')),
        'scripts/host-lock/with-host-lock.sh',
      )
      const lines = readFileSync(scriptPath, 'utf8').split('\n')

      // A plain toContain for each constant would pass even if the fail-closed emitter (the one the
      // rules' fingerprint depends on) were deleted, because both constants also appear together on
      // the benign run-unlocked line. Assert both branches independently exist instead: some line
      // carries the acquire marker WITHOUT the run-unlocked suffix (fail-closed, exit 1 — what
      // hasExpensiveBuildAcquireTimeout keys on), and some other line carries both (run-unlocked,
      // proceeds — what its negative guard excludes).
      const failClosedLines = lines.filter(
        line =>
          line.includes(hostLockAcquireTimeoutMarker) && !line.includes(hostLockRanUnlockedSuffix),
      )
      const ranUnlockedLines = lines.filter(
        line =>
          line.includes(hostLockAcquireTimeoutMarker) && line.includes(hostLockRanUnlockedSuffix),
      )

      expect(failClosedLines).not.toEqual([])
      expect(ranUnlockedLines).not.toEqual([])

      // The two assertions above only guard the acquire/run-unlocked fragments. If upstream
      // reworded the `with-host-lock:` prefix itself, hasExpensiveBuildAcquireTimeout's hardcoded
      // `with-host-lock: expensive-build ...` would go silently dead while those still passed.
      expect(lines.some(line => line.includes('with-host-lock:'))).toBe(true)
    })
  })

  describe('Table A completeness', () => {
    // Every '##[group]Run ' literal declared anywhere in this directory's *.mts sources must either
    // be one of the markers asserted above, or be explicitly allowlisted here with a reason — so
    // adding a new step-header marker with no guard row fails this test instead of failing silently
    // the way the original PR #10604 markers did.
    const tableAMarkers = new Set([
      cleanWorkspaceScriptStepMarker,
      cloudflareWorkerTscStepMarker,
      oxlintTypeAwareStepMarker,
      buildWebTargetsStepMarker,
    ])

    // This plan adds a Table A row only for build-web-targets. Keep the unrelated clean-workspace
    // marker explicitly allowlisted rather than widening this focused change into a catalogue-wide
    // migration of existing local `uses:` markers.
    const allowlistedNonTableAMarkers = new Set([
      // runner-shutdown-consumers.mts: keys on the composite-action invocation header for
      // .github/actions/clean-workspace. It remains out of this plan's build-web-targets scope.
      '##[group]Run ./.github/actions/clean-workspace',
    ])

    const sourceDir = new URL('.', import.meta.url)
    const markerLiteralPattern = /'(##\[group\]Run [^']*)'/g

    it('every declared ##[group]Run marker is covered by Table A or explicitly allowlisted', () => {
      const uncovered: string[] = []

      for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.mts') || entry.name.endsWith('.test.mts')) {
          continue
        }

        const contents = readFileSync(new URL(entry.name, sourceDir), 'utf8')
        for (const match of contents.matchAll(markerLiteralPattern)) {
          const marker = match[1]
          // '##[group]Run ' with nothing after it (runner-shutdown-consumers.mts's
          // log.indexOf('##[group]Run ', …) scan) is a generic "find the next step" prefix, not a
          // specific step-header marker — it has no single `run:` value to go stale against.
          if (marker === '##[group]Run ') continue
          if (!tableAMarkers.has(marker) && !allowlistedNonTableAMarkers.has(marker)) {
            uncovered.push(`${entry.name}: ${marker}`)
          }
        }
      }

      expect(uncovered).toEqual([])
    })
  })
})
