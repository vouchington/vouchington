import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

import {
  aggregateGateRun,
  ciWorkflowText,
  detectChangesWorkflow,
  gateScript,
  gateWrapper,
  testCoverageWorkflow,
  testsProcessingWorkflow,
  testsProcessingWorkflowText,
  workflow,
} from './ci-aggregate-gates-fixture.mts'

const execFileAsync = promisify(execFile)

// A job's timeout starts at runner assignment, before hosted-VM provisioning finishes, so a
// gate job whose own clock equals its step budget is cancelled by a slow boot alone.
const MIN_GATE_PROVISIONING_HEADROOM_MINUTES = 3

async function runDependencyFreeGate(results: string) {
  const emptyWorkspace = await mkdtemp(join(tmpdir(), 'ci-dependency-free-results-'))
  try {
    return await execFileAsync('bash', ['-c', aggregateGateRun ?? 'exit 2'], {
      cwd: emptyWorkspace,
      env: { ...process.env, HAS_FAN_IN_DEPENDENCIES: 'false', RESULTS: results },
    })
  } finally {
    await rm(emptyWorkspace, { force: true, recursive: true })
  }
}

describe('CI aggregate gates', () => {
  it('keeps required fan-in gates stable and filters Playwright on main pushes', () => {
    expect(workflow.on?.merge_group).toEqual({ types: ['checks_requested'] })
    // No job reads draft state, so draft <-> ready transitions must not start a CI run.
    expect(workflow.on?.pull_request?.types).toEqual(['opened', 'synchronize', 'reopened'])
    expect(workflow.on?.pull_request).not.toHaveProperty('branches')
    expect(workflow.on?.pull_request).not.toHaveProperty('branches-ignore')
    expect(workflow.permissions).not.toHaveProperty('issues')

    const detectChangesOutputs = detectChangesWorkflow.jobs?.['detect-changes']?.outputs ?? {}
    const testCoverageJob = testCoverageWorkflow.jobs?.['test-coverage']
    const backendSmokeJob = workflow.jobs?.['backend-smoke']
    const testsJob = workflow.jobs?.tests
    const buildJob = workflow.jobs?.build

    expect(detectChangesOutputs).not.toHaveProperty('coverage-required')
    expect(detectChangesOutputs).not.toHaveProperty('build-required')
    expect(workflow.concurrency?.['cancel-in-progress']).toBe(
      "${{ github.event_name == 'pull_request' }}",
    )
    expect(workflow.jobs?.['detect-changes']?.permissions).not.toHaveProperty('actions')

    const testPlaywrightJob = workflow.jobs?.['test-playwright']
    expect(testPlaywrightJob?.if).toContain('!cancelled()')
    expect(testPlaywrightJob?.if).toContain("needs.static-code-analysis.result == 'success'")
    // Area path selection (docs-only gate, playwright filter) is unrelated to the removed
    // dedupe/label outputs and stays intact; only the has-playwright-full label override is gone.
    expect(testPlaywrightJob?.if).toContain("needs.detect-changes.outputs.docs-only != 'true'")
    expect(testPlaywrightJob?.if).toContain("needs.detect-changes.outputs.playwright == 'true'")
    expect(testPlaywrightJob?.if).not.toContain('has-playwright-full')
    expect(testPlaywrightJob?.if).not.toContain('pr-labels-json')

    expect(testCoverageJob?.if).toBe('!cancelled()')
    expect(testCoverageJob?.if).not.toContain('skip-ci-producers')
    expect(testCoverageJob?.if).not.toContain('docs-only')
    expect(testCoverageJob?.if).not.toContain('has-vitest-full')
    expect(testCoverageJob?.outputs).toHaveProperty('vitest-report-expectations')
    expect(backendSmokeJob?.uses).toBe('./.github/workflows/checks-backend-smoke.yml')
    expect(backendSmokeJob?.if).toContain('!cancelled()')
    expect(backendSmokeJob?.if).toContain(
      "(needs.static-backend.result == 'success' || needs.static-backend.result == 'skipped')",
    )
    expect(backendSmokeJob?.if).not.toContain('has-vitest-full')
    expect(workflow.jobs?.['tests-processing']?.needs).toContain('backend-smoke')
    expect(workflow.jobs?.['test-coverage']?.needs).not.toContain('backend-smoke')
    expect(ciWorkflowText).toContain(
      '"backend-smoke":{"result":"${{ needs.backend-smoke.result }}"}',
    )
    expect(testsProcessingWorkflowText).toContain(
      'VITEST_REPORT_EXPECTATIONS: ${{ steps.merge-vitest-report-expectations.outputs.context }}',
    )
    expect(testsJob?.if).toBe('${{ !cancelled() }}')
    expect(buildJob?.if).toBe('${{ !cancelled() }}')
    expect(gateWrapper).toContain('vouchington-tooling-script.sh')
    expect(gateWrapper).toContain('scripts/gha/check-needs-results.sh')
    expect(gateScript).toContain('"result":\\s*"(failure|cancelled)"')
  })

  it('runs test-coverage unconditionally on docs-only PRs (vitest:full removed)', () => {
    expect(workflow.jobs?.['test-coverage']?.if).not.toContain('docs-only')
    expect(workflow.jobs?.['static-code-analysis']?.if).not.toContain(
      "needs.detect-changes.outputs.docs-only != 'true'",
    )
    expect(workflow.jobs?.['static-code-analysis']?.with).toMatchObject({
      docs_only: "${{ needs.detect-changes.outputs.docs-only == 'true' }}",
    })
  })

  it('moves expensive report processing behind the reusable processing boundary', () => {
    const testsSteps = testsProcessingWorkflow.jobs?.['tests-processing']?.steps ?? []

    const gatedSteps = [
      testsSteps.find(step => step.uses === './.github/actions/setup-node-pnpm'),
      testsSteps.find(step => step.name === 'Download Vitest blob reports from GitHub (fallback)'),
      testsSteps.find(step => step.name === 'Merge Vitest reports'),
    ]

    // The dedupe/full-suite-label gates (skip-ci-producers, skip-settled-producers, docs-only,
    // has-vitest-full) were removed: these steps now run on every PR/main run.
    for (const step of gatedSteps) {
      expect(step?.if).toBe(
        "!cancelled() && (github.event_name == 'pull_request' || github.event_name == 'merge_group' || github.ref == 'refs/heads/main')",
      )
      expect(step?.if).not.toContain('skip-ci-producers')
      expect(step?.if).not.toContain('skip-settled-producers')
      expect(step?.if).not.toContain('docs-only')
      expect(step?.if).not.toContain('has-vitest-full')
    }

    const deleteBlobArtifactsStep = testsSteps.find(
      step => step.name === 'Delete inter-job blob artifacts',
    )
    expect(deleteBlobArtifactsStep?.if).toBe(
      "steps.all-checks-passed.outcome == 'success' && (steps.merge-vitest-reports.outcome == 'success' || steps.merge-vitest-reports.outcome == 'skipped')",
    )

    const checkoutStep = testsSteps.find(step => step.uses?.startsWith('actions/checkout@'))
    expect(checkoutStep?.if).toBeDefined()

    const allChecksPassedStep = testsSteps.find(step => step.name === 'All checks passed')
    expect(allChecksPassedStep?.if).toBe(
      "!cancelled() && (steps.merge-vitest-reports.outcome == 'success' || steps.merge-vitest-reports.outcome == 'skipped')",
    )
    expect(allChecksPassedStep?.env?.HAS_FAN_IN_DEPENDENCIES).toBe(
      "${{ github.event_name == 'pull_request' || github.event_name == 'merge_group' || github.ref == 'refs/heads/main' }}",
    )
    expect(allChecksPassedStep?.run).toContain('jq -e')
    expect(allChecksPassedStep?.run).toContain('.result == "success" or .result == "skipped"')
    expect(allChecksPassedStep?.run).toContain('./ci/check-needs-results.sh "required jobs"')
    expect(workflow.jobs?.tests?.needs).toEqual(['tests-processing'])
    expect(workflow.jobs?.tests?.steps).toHaveLength(1)
    const testsGate = workflow.jobs?.tests?.steps?.[0]?.uses
    const buildGate = workflow.jobs?.build?.steps?.[0]?.uses
    expect(testsGate).toMatch(
      /^vouchington\/vouchington-tooling\/\.github\/actions\/ci-required-result-gate@[0-9a-f]{40}$/,
    )
    expect(ciWorkflowText).not.toMatch(/ci-required-result-gate@[0-9a-f]{40} # v1\.0\.0/)
    expect(ciWorkflowText).toMatch(/ci-required-result-gate@[0-9a-f]{40} # v0\.\d+\.\d+/)
    expect(workflow.jobs?.build?.steps).toHaveLength(1)
    expect(buildGate).toBe(testsGate)
  })

  it.each(['tests', 'build'])(
    'bounds the %s gate step and leaves job headroom for runner provisioning',
    name => {
      const job = workflow.jobs?.[name]
      const jobTimeout = job?.['timeout-minutes']
      const stepTimeout = job?.steps?.[0]?.['timeout-minutes']
      if (typeof jobTimeout !== 'number' || typeof stepTimeout !== 'number')
        throw new TypeError(`${name} needs numeric job and gate-step timeout-minutes`)
      expect(jobTimeout - stepTimeout).toBeGreaterThanOrEqual(
        MIN_GATE_PROVISIONING_HEADROOM_MINUTES,
      )
    },
  )

  it('keeps compact result payloads well below the workflow attribute limit', () => {
    const payloads = [
      workflow.jobs?.['tests-processing']?.with?.results,
      workflow.jobs?.tests?.steps?.at(-1)?.with?.results,
      workflow.jobs?.build?.steps?.at(-1)?.with?.results,
    ]

    for (const payload of payloads) {
      expect(typeof payload).toBe('string')
      if (typeof payload !== 'string')
        throw new TypeError('compact result payload must be a string')
      expect(new TextEncoder().encode(payload).byteLength).toBeLessThan(16 * 1024)
    }
  })

  it('validates dependency-free results without an installed workspace', async () => {
    await expect(
      runDependencyFreeGate(
        '{"detect-changes":{"result":"success"},"test-tooling":{"result":"skipped"}}',
      ),
    ).resolves.toMatchObject({ stdout: expect.stringContaining('passed or were skipped') })
  })

  it.each([
    '{"detect-changes":{"result":"failure"}}',
    '{"detect-changes":{"result":"cancelled"}}',
    '{"detect-changes":{"result":"unknown"}}',
    '{}',
    'not-json',
  ])('fails closed for invalid dependency-free results: %s', async results => {
    await expect(runDependencyFreeGate(results)).rejects.toMatchObject({ code: 1 })
  })

  it('selects portability tests from the dedicated portability path filter', () => {
    const testPortability = workflow.jobs?.['test-portability']

    expect(testPortability?.if).toContain("needs.detect-changes.outputs.portability == 'true'")
    expect(testPortability?.if).toContain("needs.detect-changes.outputs.docs-only != 'true'")
    expect(testPortability?.if).not.toContain("needs.detect-changes.outputs.tooling == 'true'")
    expect(testPortability?.if).not.toContain("needs.detect-changes.outputs.lambdas == 'true'")
    expect(testPortability?.if).not.toContain(
      "needs.detect-changes.outputs.cloudflare-worker == 'true'",
    )
  })
})
