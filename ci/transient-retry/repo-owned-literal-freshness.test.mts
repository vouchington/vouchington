import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import picomatch from 'picomatch'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

import {
  backendLogoutRateLimitTestTitle,
  backendLogoutRouteDescribeTitle,
  backendLogoutTestPath,
} from './backend-test-rules.mts'
import { buildBackendCredentialedFailureLog } from './backend-credentialed-fixtures.mts'
import {
  backendCredentialedProjects,
  backendCredentialedVitestCommandMarkers,
} from './backend-credentialed-log-fingerprints.mts'
import { isBackendCredentialedProviderSmokeTestTransient } from './backend-credentialed-rules.mts'
import { playwrightNavigateToHelperPath } from './playwright-rules.mts'

// Generalizes step-group-marker-freshness.test.mts's guard from the `##[group]Run` marker class to
// every repo-owned source-path literal declared anywhere in this directory — see #10806/#10825: the
// old backend-credentialed-log-fingerprints.mts hand-copied per-test paths, titles, and timeout
// digits that could (and did — hasBackendSesSendEmailTimeout, dead after testTimeout dropped from
// 120000 to 60000 in PR #8107 with nothing failing) drift silently forever with no guard like this
// one. Table A covers the literals that survived step 1's project-derived rewrite, imported from
// their rule modules rather than re-typed here — a re-typed copy could drift from what the rule
// actually matches on with this row staying green (see step-group-marker-freshness.test.mts's own
// precedent comment on this, PR #10604). Table B covers the vitest command line whose source of
// truth is a workflow YAML `run:` step rather than another `.mts` module. The completeness scanner
// is what catches the next unguarded literal, of either shape.

const repoRoot = resolve(import.meta.dirname, '../..')

// Tracked, not merely present on disk — an ignored or untracked file must neither satisfy nor fail a
// guard (see static-code-analysis/CLAUDE.md's "validate tracked repository state" invariant and its
// git-ls-files precedent in repo-file-policy/agent-blackboard-mcp-config.test.mts).
function trackedPaths(paths: readonly string[]): Set<string> {
  return new Set(
    execFileSync('git', ['ls-files', '-z', '--', ...paths], { cwd: repoRoot, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean),
  )
}

function readTracked(path: string): string {
  if (!trackedPaths([path]).has(path)) throw new Error(`not a tracked file: ${path}`)
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

// The two `backend-aws` include entries that aren't glob patterns — vitest.config.mts hand-enumerates
// them rather than using a `*.s3.test.mts`-style suffix glob (ses.generated.test.mts isn't named
// `*.s3.test.mts`). Derived from backendCredentialedProjects (already cross-checked against
// vitest.config.mts below) instead of re-typed, for the same reason as the two imports above.
const backendAwsLiteralIncludePaths = (
  backendCredentialedProjects.find(({ project }) => project === 'backend-aws')?.include ?? []
).filter(path => !path.includes('*'))

describe('repo-owned-literal-freshness', () => {
  describe('surviving repo-owned literals (Table A)', () => {
    it('backend-test-rules.mts logout fixture path and titles are fresh', () => {
      const source = readTracked(backendLogoutTestPath)
      expect(source).toContain(backendLogoutRouteDescribeTitle)
      expect(source).toContain(backendLogoutRateLimitTestTitle)
    })

    it('playwright-rules.mts navigate-to helper path is fresh', () => {
      expect(trackedPaths([playwrightNavigateToHelperPath])).toEqual(
        new Set([playwrightNavigateToHelperPath]),
      )
    })

    it("backend-credentialed-log-fingerprints.mts's hand-enumerated backend-aws include paths are fresh", () => {
      expect(backendAwsLiteralIncludePaths).not.toEqual([])
      expect(trackedPaths(backendAwsLiteralIncludePaths)).toEqual(
        new Set(backendAwsLiteralIncludePaths),
      )
    })
  })

  describe("backend-credentialed vitest command line agrees with tests-backend-credentialed.yml's own run: step (Table B)", () => {
    // Text-extracted via yaml's parse rather than imported as code, matching
    // step-group-marker-freshness.test.mts's own Table A precedent — a workflow file is data, not a
    // module this test should execute.
    interface YamlStep {
      name?: string
      run?: unknown
    }
    interface YamlWorkflow {
      jobs?: Record<string, { steps?: YamlStep[] }>
    }

    const workflowPath = '.github/workflows/tests-backend-credentialed.yml'
    const parsed = parseYaml(readTracked(workflowPath)) as YamlWorkflow
    const steps = Object.values(parsed.jobs ?? {}).flatMap(job => job.steps ?? [])
    const runStep = steps.find(step => step.name === 'Run backend credentialed tests')
    const runText = typeof runStep?.run === 'string' ? runStep.run : ''

    it(`the "Run backend credentialed tests" step still exists in ${workflowPath}`, () => {
      expect(typeof runStep?.run).toBe('string')
    })

    it.each(backendCredentialedVitestCommandMarkers)(
      '%s still appears in the real run: step',
      marker => {
        expect(runText).toContain(marker)
      },
    )

    it("the step's --project flags exactly match backendCredentialedProjects — a fifth credentialed project can't ship without a table row", () => {
      const projectFlags = [...runText.matchAll(/--project\s+(\S+)/g)].map(([, name]) => name)
      expect(projectFlags).toEqual(backendCredentialedProjects.map(({ project }) => project))
    })
  })

  describe("backend-credentialed include globs agree with vitest.config.mts's own", () => {
    // Text-extracted rather than imported: vitest.config.mts pulls in DB/Valkey alias resolution
    // (realGlideMqAlias/backendAliases) that decide.mts's fingerprint modules must stay
    // dependency-free of — see backend-credentialed-log-fingerprints.mts's own comment on this. This
    // is the source-of-truth cross-check the plan's step 1 promises for that file's literal table.
    const configSource = readFileSync(resolve(repoRoot, 'vitest.config.mts'), 'utf8')

    function realConfigInclude(project: string): string[] {
      const match = new RegExp(`name:\\s*'${project}',\\s*include:\\s*\\[([^\\]]*)\\]`).exec(
        configSource,
      )
      if (!match) throw new Error(`no vitest.config.mts project block found for '${project}'`)
      return [...match[1].matchAll(/'([^']*)'/g)].map(([, literal]) => literal)
    }

    it.each(backendCredentialedProjects.map(({ project }) => project))(
      "%s's include glob(s) match vitest.config.mts",
      project => {
        const table = backendCredentialedProjects.find(entry => entry.project === project)
        expect(table?.include).toEqual(realConfigInclude(project))
      },
    )
  })

  describe('worker-exit-diagnostics fixture allowlist', () => {
    // backend-test-worker-exit-ci-rules.fixtures.mts uses these as illustrative Vitest module-id
    // sample values passed to formatWorkerExitDiagnostics() — the diagnostics reporter accepts an
    // arbitrary module id string, so neither literal is a freshness pin the matcher depends on.
    // 'flows.test.mts' happens to be a real tracked file under jwt-session/; 'refresh.test.mts' is
    // not (only flows.test.mts, flows.part-2.test.mts, etc. exist there) — neither fact matters to
    // the fixture, which is exactly why both are allowlisted here instead of asserted to exist.
    it('does not require the jwt-session sample module ids to exist on disk', () => {
      expect(trackedPaths(['backend/services/jwt-session/refresh.test.mts'])).toEqual(new Set())
    })
  })

  describe('completeness', () => {
    const tableAPaths = new Set([
      backendLogoutTestPath,
      playwrightNavigateToHelperPath,
      ...backendAwsLiteralIncludePaths,
    ])
    // Reason required inline at the point of use above; duplicated here only as the set the scanner
    // checks against.
    const allowlistedLiterals = new Set([
      'backend/services/jwt-session/flows.test.mts',
      'backend/services/jwt-session/refresh.test.mts',
    ])

    // A repo-relative source-path *literal*: no glob metacharacters, so the four credentialed
    // projects' own include globs (`backend/**/*.bedrock.test.mts` and siblings, cross-checked
    // against vitest.config.mts above, not existence-checked here) never match this pattern — a
    // glob is validated differently than a single fixed path.
    const pathLiteralPattern =
      /'((?:backend|web|playwright|cloudflare-worker)\/[^'\s*?[\]]*\.(?:mts|ts|tsx))'/g

    function scanForUncoveredLiterals(sourceDir: string): string[] {
      const uncovered: string[] = []

      for (const entry of readdirSync(sourceDir, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.mts') || entry.name.endsWith('.test.mts')) {
          continue
        }
        // Matches the ast-grep rule's own ignores: nothing under __tests__/ is a source-of-truth
        // module for this scanner to police.
        if (entry.parentPath.split(sep).includes('__tests__')) continue

        const filePath = resolve(entry.parentPath, entry.name)
        const contents = readFileSync(filePath, 'utf8')
        for (const match of contents.matchAll(pathLiteralPattern)) {
          const literal = match[1]
          if (!tableAPaths.has(literal) && !allowlistedLiterals.has(literal)) {
            uncovered.push(`${filePath.slice(sourceDir.length + 1)}: ${literal}`)
          }
        }
      }

      return uncovered
    }

    it('every repo-owned path literal in ci/transient-retry/** is covered by Table A or explicitly allowlisted', () => {
      expect(scanForUncoveredLiterals(resolve(repoRoot, 'ci/transient-retry'))).toEqual([])
    })

    it('flags an unguarded repo-owned path literal added without a table row', () => {
      // Synthetic fixture, not a real source file — proves the scanner can actually fail,
      // independent of whether any repo file happens to carry an unguarded literal today (mirrors
      // step-group-marker-freshness.test.mts's own synthetic-fixture pattern for the same reason).
      const found = [
        ..."const rogue = 'backend/services/unrelated/rogue.test.mts'\n".matchAll(
          pathLiteralPattern,
        ),
      ].map(match => match[1])

      expect(
        found.some(literal => !tableAPaths.has(literal) && !allowlistedLiterals.has(literal)),
      ).toBe(true)
    })
  })

  describe('backend-credentialed coverage guard', () => {
    // The direct regression test for the #10800 gap this plan closes: every real tracked file
    // matched by a credentialed project's own `include` glob must be recognized as transient by the
    // project-derived matcher — a new probe test fails this test the day it is added, instead of
    // silently escalating the way search-posts-semantic.bedrock.test.mts did.
    const trackedBackendFiles = execFileSync('git', ['ls-files', '-z', '--', 'backend'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)

    for (const { project, include } of backendCredentialedProjects) {
      const isIncluded = picomatch([...include])
      const matchedFiles = trackedBackendFiles.filter(path => isIncluded(path))

      it(`covers every tracked file matched by ${project}'s include glob(s)`, () => {
        expect(matchedFiles.length).toBeGreaterThan(0)

        const uncoveredFiles = matchedFiles.filter(path => {
          const log = buildBackendCredentialedFailureLog([
            {
              project,
              path,
              markerLines: [
                'Error: Test timed out in 30000ms.',
                'If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".',
              ],
            },
          ])
          return !isBackendCredentialedProviderSmokeTestTransient(log)
        })

        expect(uncoveredFiles).toEqual([])
      })
    }
  })
})
