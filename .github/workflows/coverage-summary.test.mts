import { readdirSync, readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { SUITE_CASE_PATTERN, VALID_SUITE } from '../test-helpers/coverage-summary.test-helpers.mts'

const read = (path: string): string => readFileSync(path, 'utf8')

type Workflow = {
  permissions?: Record<string, string>
  on?: Record<
    'workflow_call' | 'workflow_dispatch',
    { inputs?: Record<string, { default?: unknown }> }
  >
  jobs?: Record<
    string,
    {
      if?: string
      permissions?: Record<string, string>
      uses?: string
      with?: Record<string, unknown>
      steps?: Array<{
        id?: string
        name?: string
        if?: string
        run?: string
        uses?: string
        'continue-on-error'?: boolean
        'timeout-minutes'?: number
        with?: Record<string, unknown>
      }>
    }
  >
}

const coverageProducerWorkflows = [
  '.github/workflows/tests-ts-shared.yml',
  '.github/workflows/tests-tooling.yml',
  '.github/workflows/tests-backend-modules.yml',
  '.github/workflows/tests-backend-unit.yml',
  '.github/workflows/tests-backend-credentialed.yml',
  '.github/workflows/tests-web.yml',
  '.github/workflows/tests-web-api.yml',
  '.github/workflows/storybook.yml',
  '.github/workflows/tests-web-integration.yml',
  '.github/workflows/tests-cloudflare-worker.yml',
  '.github/workflows/tests-lambdas.yml',
  '.github/workflows/tests-portability.yml',
]

const uploadCoveragePairAction = './.github/actions/upload-coverage-pair'
const downloadCoverageControlAction = './.github/actions/download-coverage-control'

function jobSection(workflow: string, jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  expect(start).toBeGreaterThanOrEqual(0)
  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('PR patch coverage', () => {
  it('keeps patch coverage as the sole PR coverage gate', () => {
    const workflow = read('.github/workflows/ci.yml')
    const coverageWorkflow = read('.github/workflows/ci-test-coverage.yml')
    const coverageJob = jobSection(coverageWorkflow, 'test-coverage')
    const coverageCaller = jobSection(workflow, 'test-coverage')
    const testsJob = jobSection(workflow, 'tests-processing')

    expect(coverageJob).toContain('name: Patch Coverage')
    expect(coverageJob).toContain("github.event_name == 'pull_request'")
    expect(coverageCaller).toContain('- test-backend-modules')
    expect(coverageJob).toContain('pull-requests: write')
    expect(coverageJob).not.toContain('id-token: write')
    expect(coverageCaller).not.toContain('id-token: write')
    expect(coverageWorkflow).not.toContain('CODECOV_TOKEN')
    expect(coverageCaller).not.toContain('CODECOV_TOKEN')
    expect(coverageJob).toContain('name: Prepare coverage artifacts')
    expect(coverageJob).toContain('name: Report current PR coverage and enforce patch coverage')
    expect(coverageJob).toContain('run: ./ci/coverage-artifacts.sh pr-check')
    expect(testsJob).toContain('test-coverage')
    expect(testsJob).not.toContain('upload-codecov')
    expect(workflow).not.toContain(`\n  ${['coverage', 'store'].join('-')}:`)
    expect(workflow).not.toContain('prepared-lcov')
  })

  it('uses exact pull request base and head SHAs for the patch', () => {
    const coverageJob = jobSection(read('.github/workflows/ci-test-coverage.yml'), 'test-coverage')

    expect(coverageJob).toContain('COVERAGE_BASE: ${{ github.event.pull_request.base.sha }}')
    expect(coverageJob).toContain('COVERAGE_HEAD: ${{ github.event.pull_request.head.sha }}')
    expect(coverageJob).not.toContain('origin/${{ github.base_ref }}')
  })

  it('stamps Storybook coverage from the orchestrator merge revision for trusted and dependency-bot PRs', () => {
    const storybookJob = jobSection(read('.github/workflows/ci.yml'), 'storybook')

    expect(storybookJob).toContain('checkout_ref: ${{ github.sha }}')
    expect(storybookJob).not.toContain('github.event.pull_request.head.sha')
    expect(storybookJob).toContain(
      "(needs.detect-changes.outputs.trusted-secret-context == 'true' || needs.detect-changes.outputs.dependency-bot-test-context == 'true')",
    )
    expect(storybookJob).toContain("publish_coverage: ${{ github.event_name == 'pull_request' }}")
    expect(storybookJob).not.toContain('publish_static_artifact')
    expect(storybookJob).not.toContain('publish_prefix:')
  })

  it('reports current selected-suite coverage without a baseline or history store', () => {
    const script = read('ci/coverage-artifacts.sh')

    expect(script).toContain('"$coverage_check_bin" merge')
    expect(script).toContain('"$coverage_check_bin" check')
    expect(script).toContain('--suite current-pr')
    expect(script).not.toContain('--no-summary-file')
    expect(script).not.toContain('--store-s3')
    expect(script).not.toContain('--drop-only')
    expect(script).not.toContain(['store', 'main'].join('-'))
    expect(script).not.toContain('main-check')

    for (const path of ['.github/workflows/main-web.yml', '.github/workflows/main-backend.yml']) {
      expect(read(path)).not.toContain(`${['store', 'coverage'].join('-')}:`)
    }
  })

  it('requires a complete provenance pair and retries every GitHub LCOV fallback once', () => {
    const action = load(read('.github/actions/upload-coverage-pair/action.yml')) as {
      inputs?: Record<string, { required?: boolean }>
      runs?: { using?: string; steps?: NonNullable<Workflow['jobs']>[string]['steps'] }
    }
    const [validation, upload] = action.runs?.steps ?? []
    expect(action).toMatchObject({
      inputs: { suite: { required: true }, 'name-suffix': { required: false, default: '' } },
      runs: { using: 'composite' },
    })
    expect(action).not.toHaveProperty('outputs')
    expect(action.runs?.steps).toHaveLength(2)
    expect(validation).toMatchObject({
      name: 'Validate coverage suite',
      shell: 'bash',
      env: { SUITE: '${{ inputs.suite }}', LC_ALL: 'C' },
    })
    expect(upload?.uses?.startsWith('actions/upload-artifact@')).toBe(true)
    expect(upload?.uses?.slice('actions/upload-artifact@'.length)).toMatch(/^[0-9a-f]{40}$/)
    expect(upload?.with).toEqual({
      overwrite: true,
      name: 'coverage-${{ inputs.suite }}${{ inputs.name-suffix }}',
      path: 'coverage/lcov.info\ncoverage/coverage-manifest.json\n',
      'retention-days': 1,
      'if-no-files-found': 'error',
    })
    expect(validation?.run).toBe(
      `case "$SUITE" in\n  ${SUITE_CASE_PATTERN})\n    echo "::error::Invalid coverage suite: expected lowercase alphanumeric segments separated by single hyphens, and must not be \\"retry\\" or end in \\"-retry\\" (reserved for this action's own name-suffix retry mechanism)" >&2\n    exit 1\n    ;;\nesac\n`,
    )
    for (const suite of ['web', 'backend-1']) expect(suite).toMatch(VALID_SUITE)
    for (const suite of [
      '',
      'Web',
      'web/1',
      '-web',
      'web-',
      'web--1',
      'web_1',
      'retry',
      'integration-retry',
    ]) {
      expect(suite).not.toMatch(VALID_SUITE)
    }
    const uploads = coverageProducerWorkflows.flatMap(path => {
      const workflow = load(read(path)) as Workflow
      return Object.values(workflow.jobs ?? {}).flatMap(job =>
        (job.steps ?? [])
          .filter(
            step => step.uses === uploadCoveragePairAction && typeof step.with?.suite === 'string',
          )
          .map(step => ({
            path,
            suite: step.with?.suite as string,
            continueOnError: step['continue-on-error'],
            id: step.id,
            timeout: step['timeout-minutes'],
            nameSuffix: step.with?.['name-suffix'],
          })),
      )
    })

    expect(uploads).toHaveLength(28)
    for (const upload of uploads) {
      expect(upload).toMatchObject({
        continueOnError: true,
        timeout: 3,
      })
      expect(upload.suite).not.toHaveLength(0)
      expect(upload.suite.replace(/\$\{\{[^}]*\}\}/g, 'x')).toMatch(VALID_SUITE)
      expect(upload.id).toMatch(/^coverage-fallback-[12]-\d+$/)
      expect(upload.nameSuffix).toBe(
        upload.id?.startsWith('coverage-fallback-2-') ? '-retry' : undefined,
      )
    }
    expect(coverageProducerWorkflows.map(read).join('\n')).not.toMatch(
      /uses: actions\/upload-artifact@[\s\S]*?coverage\/coverage-manifest\.json/,
    )
  })

  it('normalizes retried coverage pair directories before preparing coverage artifacts', () => {
    const source = read('.github/workflows/ci-test-coverage.yml')
    expect(source).toMatch(
      /run: \.\/ci\/download-optional-run-artifacts\.sh --pattern 'coverage-\*' --dir '\.\/coverage-fallback'\n\s+- name: Normalize retried coverage pair directories\n\s+if: "!cancelled\(\) && github\.event_name == 'pull_request'"\n\s+run: node ci\/normalize-retry-artifact-directories\.mts \.\/coverage-fallback\n\s+- name: Prepare coverage artifacts/,
    )
  })

  it('does not use the retired S3 coverage-transport control action', () => {
    const paths = [...coverageProducerWorkflows, '.github/workflows/tests-postgres-schema.yml']
    for (const path of paths) {
      const workflow = load(read(path)) as Workflow
      for (const job of Object.values(workflow.jobs ?? {})) {
        const steps = job.steps ?? []
        expect(steps.some(step => step.uses === downloadCoverageControlAction)).toBe(false)
        expect(
          steps.some(
            step =>
              step.uses?.startsWith('actions/download-artifact@') &&
              (step.with?.name === 'transport-upload-control' ||
                step.with?.name === 'transport-download-control' ||
                step.with?.name === 'transport-vitest-download-control'),
          ),
        ).toBe(false)
      }
    }
    const postgres = read('.github/workflows/tests-postgres-schema.yml')
    expect(postgres).not.toContain('FAMILY: coverage-pair')
    expect(postgres).not.toContain(uploadCoveragePairAction)
  })

  it('publishes the sparse coverage pair only for the ci.yml pull-request consumer', () => {
    const prOnly = "${{ github.event_name == 'pull_request' }}"
    const workflows = readdirSync('.github/workflows')
      .filter(file => file.endsWith('.yml'))
      .map(file => ({ file, workflow: load(read(`.github/workflows/${file}`)) as Workflow }))
    const ciJobs = Object.values(workflows.find(({ file }) => file === 'ci.yml')!.workflow.jobs!)

    for (const path of coverageProducerWorkflows) {
      const workflow = load(read(path)) as Workflow
      const steps = Object.values(workflow.jobs ?? {}).flatMap(job => job.steps ?? [])
      const pairSteps = steps.filter(
        step => step.uses === uploadCoveragePairAction || step.id?.startsWith('coverage-stamp-'),
      )

      const inputs = ['publish_coverage', 'publish_coverage_pair']
      expect(
        inputs.map(input => ({
          path,
          input,
          default: workflow.on?.workflow_call?.inputs?.[input]?.default,
          dispatchable: workflow.on?.workflow_dispatch?.inputs?.[input] !== undefined,
        })),
      ).toEqual(inputs.map(input => ({ path, input, default: false, dispatchable: false })))
      expect(pairSteps.length).toBeGreaterThan(0)
      for (const step of pairSteps) expect(step.if).toMatch(/\binputs\.publish_coverage_pair\b/)

      const callers = ciJobs.filter(job => job.uses === `./${path}`)
      expect({ path, callers: callers.length }).toEqual({ path, callers: 1 })
      expect(callers[0]!.with).toMatchObject({
        publish_coverage: prOnly,
        publish_coverage_pair: prOnly,
      })
    }

    // Area workflows publish full LCOV on every event; only ci.yml consumes the pair.
    const pairCallers = workflows
      .filter(({ file }) => file !== 'ci.yml')
      .flatMap(({ file, workflow }) =>
        Object.values(workflow.jobs ?? {})
          .filter(job => job.with !== undefined && 'publish_coverage_pair' in job.with)
          .map(() => file),
      )
    expect(pairCallers).toEqual([])
  })
})
