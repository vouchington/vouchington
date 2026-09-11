import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

import {
  aggregateGateRun,
  ciControlWorkflowText,
  ciWorkflowText,
  detectChangesWorkflow,
  gateScript,
  gateWrapper,
  readyDedupeWorkflow,
  readyDedupeScriptText,
  selectCiWorkflow,
  testCoverageWorkflow,
  testsProcessingWorkflow,
  testsProcessingWorkflowText,
  workflow,
} from './ci-aggregate-gates-fixture.mts'

const execFileAsync = promisify(execFile)

const producerSkipGate = "needs.detect-changes.outputs.skip-ci-producers != 'true'"

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
    expect(workflow.on?.pull_request?.types).toContain('ready_for_review')
    expect(workflow.on?.pull_request?.types).not.toContain('labeled')
    expect(workflow.on?.pull_request).not.toHaveProperty('branches')
    expect(workflow.on?.pull_request).not.toHaveProperty('branches-ignore')
    expect(workflow.permissions).not.toHaveProperty('issues')

    const detectChangesOutputs = detectChangesWorkflow.jobs?.['detect-changes']?.outputs ?? {}
    const readyDedupeJob = readyDedupeWorkflow.jobs?.['ready-dedupe']
    const readyDedupeStep = readyDedupeJob?.steps?.find(
      step => step.name === 'Detect duplicate ready_for_review CI',
    )
    const testPlaywrightJob = workflow.jobs?.['test-playwright']
    const testCoverageJob = testCoverageWorkflow.jobs?.['test-coverage']
    const backendSmokeJob = workflow.jobs?.['backend-smoke']
    const testsJob = workflow.jobs?.tests
    const buildJob = workflow.jobs?.build

    expect(detectChangesOutputs).not.toHaveProperty('coverage-required')
    expect(detectChangesOutputs).not.toHaveProperty('build-required')
    expect(detectChangesOutputs).toHaveProperty('skip-ci-producers')
    expect(detectChangesOutputs).toHaveProperty('skip-expensive-jobs')
    expect(detectChangesOutputs).toHaveProperty('skip-settled-producers')
    expect(detectChangesOutputs).toHaveProperty('pr-labels-json')
    expect(detectChangesOutputs).toHaveProperty('has-playwright-full')
    expect(detectChangesOutputs).toHaveProperty('has-vitest-full')
    expect(readyDedupeJob?.permissions).toEqual({
      actions: 'read',
      contents: 'read',
      'pull-requests': 'read',
    })
    expect(readyDedupeJob?.steps?.some(step => step.uses?.includes('checkout'))).toBe(false)
    expect(readyDedupeJob?.steps?.some(step => step.uses?.startsWith('./'))).toBe(false)
    expect(readyDedupeJob?.steps).toHaveLength(1)
    expect(readyDedupeStep?.env?.WORKFLOW_JOB).toBe('${{ toJson(job) }}')
    expect(readyDedupeStep?.run).toContain('.workflow_repository // empty')
    expect(readyDedupeStep?.run).toContain('.workflow_sha // empty')
    expect(readyDedupeStep?.run).toContain(
      'repos/$workflow_repository/contents/$script_path?ref=$workflow_sha',
    )
    expect(readyDedupeStep?.run).toContain("--header 'Accept: application/vnd.github.raw+json'")
    expect(readyDedupeStep?.run).not.toContain('base64')
    expect(readyDedupeStep?.run).toContain("script_path='ci/ready-dedupe.sh'")
    expect(readyDedupeStep?.run).toContain(
      'mktemp "${RUNNER_TEMP:?RUNNER_TEMP is required}/ready-dedupe.XXXXXX"',
    )
    expect(readyDedupeStep?.run).toContain('[ ! -s "$script_file" ]')
    expect(readyDedupeStep?.run).not.toContain(':-/tmp')
    expect(readyDedupeStep?.run).toContain('bash "$script_file"')
    expect(readyDedupeStep?.run).not.toContain('duplicate=false')
    expect(workflow.concurrency?.['cancel-in-progress']).toBe(
      "${{ github.event_name == 'pull_request' && github.event.action != 'ready_for_review' }}",
    )
    expect(workflow.jobs?.['detect-changes']?.permissions).not.toHaveProperty('actions')
    expect(ciControlWorkflowText).toContain('TESTED_SHA: ${{ github.sha }}')
    expect(readyDedupeScriptText).toContain('pr-labels-json=$labels_json')
    expect(readyDedupeScriptText).toContain('has-playwright-full=$has_playwright_full')
    expect(readyDedupeScriptText).toContain('has-vitest-full=$has_vitest_full')
    expect(readyDedupeScriptText).toContain('[ -n "$TESTED_SHA" ] &&')
    expect(readyDedupeScriptText).toContain('[ "$has_playwright_full" != "true" ] &&')
    expect(readyDedupeScriptText).toContain('[ "$has_vitest_full" != "true" ]; then')
    expect(readyDedupeScriptText).toContain(
      'Skipping ready_for_review dedupe because the vitest:full label requests a fresh full Vitest suite.',
    )
    expect(readyDedupeScriptText).toContain('actions/artifacts?name=ci-state-$TESTED_SHA')
    expect(readyDedupeScriptText).toContain('.testedSha == $tested')
    expect(readyDedupeScriptText).toContain('.headSha == $head')
    expect(readyDedupeScriptText).toContain('.prNumber == $pr')

    expect(testPlaywrightJob?.if).toContain("github.event_name == 'workflow_dispatch'")
    expect(testPlaywrightJob?.if).toContain("needs.detect-changes.outputs.playwright == 'true'")
    expect(testPlaywrightJob?.if).toContain(
      "needs.detect-changes.outputs.has-playwright-full == 'true'",
    )
    expect(testPlaywrightJob?.if).toContain(
      "needs.detect-changes.outputs.docs-only != 'true' || needs.detect-changes.outputs.has-playwright-full == 'true'",
    )
    expect(testPlaywrightJob?.if).not.toContain("github.event_name != 'pull_request'")

    expect(testCoverageJob?.if).toContain(
      "inputs.detect-changes-outputs-skip-ci-producers != 'true'",
    )
    expect(testCoverageJob?.if).toContain("inputs.detect-changes-outputs-docs-only != 'true'")
    expect(testCoverageJob?.if).toContain("inputs.detect-changes-outputs-has-vitest-full == 'true'")
    expect(testCoverageJob?.outputs).toHaveProperty('vitest-report-expectations')
    expect(backendSmokeJob?.uses).toBe('./.github/workflows/checks-backend-smoke.yml')
    expect(backendSmokeJob?.if).toContain("github.event_name == 'workflow_dispatch'")
    expect(backendSmokeJob?.if).toContain("needs.select-ci.outputs.full-suite == 'true'")
    expect(backendSmokeJob?.if).toContain("needs.detect-changes.outputs.backend == 'true'")
    expect(backendSmokeJob?.if).toContain("needs.detect-changes.outputs.has-vitest-full == 'true'")
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

  it('skips expensive producer jobs for duplicate ready_for_review runs without hiding required gates', () => {
    const producerSkippedJobs = [
      'static-code-analysis',
      'static-backend',
      'static-web',
      'static-lambdas',
      'static-cloudflare-worker',
      'initialize-smoke-test',
      'test-ts-shared',
      'test-tooling',
      'test-backend-unit',
      'backend-smoke',
      'test-backend-modules',
      'test-backend-credentialed',
      'test-postgres-schema',
      'test-web',
      'test-web-api',
      'storybook',
      'test-web-integration',
      'test-playwright',
      'test-playwright-credentialed',
      'test-cloudflare-worker',
      'test-lambdas',
      'test-explain-analyze',
      'test-portability',
      'test-coverage',
      'build-backend',
      'build-web',
    ]

    for (const jobName of producerSkippedJobs) {
      expect(workflow.jobs?.[jobName]?.if).toContain(producerSkipGate)
    }

    expect(workflow.jobs?.tests?.if).toBe('${{ !cancelled() }}')
    expect(workflow.jobs?.build?.if).toBe('${{ !cancelled() }}')
  })

  it('skips select-ci and test-coverage on docs-only PRs unless vitest:full is set', () => {
    expect(selectCiWorkflow.jobs?.['select-ci']?.if).toContain(
      "inputs.detect-changes-outputs-docs-only != 'true'",
    )
    expect(selectCiWorkflow.jobs?.['select-ci']?.if).toContain(
      "inputs.detect-changes-outputs-has-vitest-full == 'true'",
    )
    expect(workflow.jobs?.['test-coverage']?.if).toContain(
      "needs.detect-changes.outputs.docs-only != 'true'",
    )
    expect(workflow.jobs?.['static-code-analysis']?.if).not.toContain(
      "needs.detect-changes.outputs.docs-only != 'true'",
    )
    expect(workflow.jobs?.['static-code-analysis']?.with).toMatchObject({
      docs_only: "${{ needs.detect-changes.outputs.docs-only == 'true' }}",
    })
    expect(workflow.jobs?.['test-web']?.if).toContain(
      "needs.select-ci.outputs.skip-test-web != 'true'",
    )
    expect(workflow.jobs?.['test-backend-unit']?.if).toContain(
      "needs.select-ci.outputs.skip-test-backend-unit != 'true'",
    )
  })

  it('moves expensive report processing behind the reusable processing boundary', () => {
    const testsSteps = testsProcessingWorkflow.jobs?.['tests-processing']?.steps ?? []

    const gatedSteps = [
      testsSteps.find(step => step.uses === './.github/actions/setup-node-pnpm'),
      testsSteps.find(step => step.name === 'Download Vitest blob reports from GitHub (fallback)'),
      testsSteps.find(step => step.name === 'Merge Vitest reports'),
      testsSteps.find(step => step.name === 'Delete inter-job blob artifacts'),
    ]

    for (const step of gatedSteps) {
      expect(step?.if).toBeDefined()
      expect(step?.if).toContain("inputs.skip-ci-producers != 'true'")
      expect(step?.if).toContain("inputs.skip-settled-producers != 'true'")
      expect(step?.if).toContain("inputs.docs-only != 'true'")
      expect(step?.if).toContain("inputs.has-vitest-full == 'true'")
    }

    const checkoutStep = testsSteps.find(step => step.uses?.startsWith('actions/checkout@'))
    const cleanWorkspaceStep = testsSteps.find(
      step => step.uses === './.github/actions/clean-workspace',
    )
    expect(checkoutStep?.if).toBeDefined()
    expect(cleanWorkspaceStep?.if).toBeDefined()

    const allChecksPassedStep = testsSteps.find(step => step.name === 'All checks passed')
    expect(allChecksPassedStep?.if).toBe(
      "!cancelled() && (steps.merge-vitest-reports.outcome == 'success' || steps.merge-vitest-reports.outcome == 'skipped')",
    )
    expect(allChecksPassedStep?.env?.HAS_FAN_IN_DEPENDENCIES).toContain('inputs.skip-ci-producers')
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
