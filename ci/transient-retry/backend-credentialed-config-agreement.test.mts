import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import picomatch from 'picomatch'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

import { buildBackendCredentialedFailureLog } from './backend-credentialed-fixtures.mts'
import {
  backendCredentialedProjects,
  backendCredentialedVitestCommandMarkers,
} from './backend-credentialed-log-fingerprints.mts'
import { isBackendCredentialedProviderSmokeTestTransient } from './backend-credentialed-rules.mts'

// The classifier's credentialed-project boundary is derived from the project list Vitest itself
// runs (test-helpers/vitest-config/backend-credentialed-projects.mts), so the only place left to
// drift is the workflow that invokes those projects. These tests check that the workflow still runs
// exactly those projects, and that every test file a project collects is classified as transient
// when it times out — see #10806/#10825 for the drift this replaced.

const repoRoot = resolve(import.meta.dirname, '../..')

// Tracked, not merely present on disk — an ignored or untracked file must neither satisfy nor fail a
// guard (see static-code-analysis/AGENTS.md's "validate tracked repository state" invariant and its
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

describe('backend-credentialed config agreement', () => {
  describe("the vitest command line agrees with tests-backend-credentialed.yml's run: step", () => {
    // Text-extracted via yaml's parse rather than imported as code, matching
    // step-group-marker-freshness.test.mts's precedent — a workflow file is data, not a module this
    // test should execute.
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

    it('the step runs exactly the shared credentialed projects, in any order', () => {
      const projectFlags = [...runText.matchAll(/--project\s+(\S+)/g)].map(([, name]) => name)
      expect(projectFlags.toSorted()).toEqual(
        backendCredentialedProjects.map(({ project }) => project).toSorted(),
      )
    })
  })

  describe('backend-credentialed coverage guard', () => {
    // The direct regression test for the #10800 gap: every real tracked file matched by a
    // credentialed project's own `include` glob must be recognized as transient by the
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
