import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflowDir = '.github/workflows'
const workflowFiles = readdirSync(workflowDir).filter(file => /\.(ya?ml)$/.test(file))
const blobWorkflowFiles = workflowFiles.filter(file =>
  readFileSync(join(workflowDir, file), 'utf8').includes(
    'uses: ./.github/actions/upload-vitest-blob',
  ),
)

type WorkflowStep = {
  env?: Record<string, unknown>
  run?: string
}
type Workflow = {
  jobs?: Record<string, { steps?: WorkflowStep[] }>
}

function vitestBlobStepBlocks(source: string): string[] {
  return source
    .split(/\n {6}- /)
    .filter(step => step.includes('uses: ./.github/actions/upload-vitest-blob'))
}

describe('Vitest CI reporters', () => {
  it('uses configured CI reporters for every workflow Vitest command', () => {
    const commands = workflowFiles.flatMap(file => {
      const path = join(workflowDir, file)
      const parsed = load(readFileSync(path, 'utf8')) as Workflow
      return Object.values(parsed.jobs ?? {}).flatMap(job =>
        (job.steps ?? []).flatMap(step =>
          (step.run ?? '')
            .split('\n')
            .filter(
              line =>
                (line.includes('vitest run') ||
                  line.includes('ci/tooling-test-runner.mts') ||
                  line.includes('run-storybook-browser-tests.mts') ||
                  /pnpm run test:[^\s]+/.test(line)) &&
                !line.includes('--merge-reports='),
            )
            .map(line => ({ command: `${path}: ${line.trim()}`, env: step.env ?? {} })),
        ),
      )
    })
    const workflowText = workflowFiles
      .map(file => readFileSync(join(workflowDir, file), 'utf8'))
      .join('\n')

    expect(commands.length).toBeGreaterThan(0)

    for (const { command } of commands.filter(
      ({ command: rawCommand }) =>
        !rawCommand.includes('run-storybook-browser-tests.mts') &&
        !rawCommand.includes('--project i18n-route-bounds'),
    )) {
      expect(command).toContain('--bail=3')
    }

    const isolatedRouteBounds = commands.filter(({ command }) =>
      command.includes('--project i18n-route-bounds'),
    )
    // Route bounds is intentionally isolated from the regular tooling coverage/blob producer:
    // both jobs are called by the same test-tooling workflow, whose fan-in owns one tooling
    // report. A second producer here would require a separate top-level expectation and would
    // make the existing tooling artifact ambiguous.
    expect(isolatedRouteBounds.map(({ env }) => env)).toEqual([
      { VITEST_SELECTED_FILES: "${{ !inputs.full_suite && inputs.selected_test_files || '' }}" },
    ])

    for (const { command, env } of commands.filter(
      ({ command }) => !command.includes('--project i18n-route-bounds'),
    )) {
      expect(command).not.toContain('--reporter=')
      expect(command).not.toContain('--outputFile=')
      expect(command).not.toContain('--reporter=dot')
      expect(env.VITEST_CI_REPORTERS).toBe('run')
      expect(env.VITEST_JUNIT_OUTPUT_FILE).toMatch(/\S+\.junit\.xml/)
      expect(env.VITEST_BLOB_OUTPUT_FILE).toMatch(/^\.vitest-reports\//)
    }

    // The vitest blob upload is a leaf composite action call (upload-vitest-blob), made
    // twice per suite (attempt 1 + attempt 2 retry). Attempt 1's step name is the only one
    // ending in the bare "(fallback)" suffix — the retry's name ends "(fallback attempt 2)"
    // — so this counts exactly one first-attempt call per Vitest command.
    expect(
      workflowText.match(/name: Upload .+ vitest blob to GitHub \(fallback\)$/gm)?.length,
    ).toBe(
      commands.filter(({ command }) => !command.includes('--project i18n-route-bounds')).length,
    )

    // The upload's path/include-hidden-files pair now lives once in the shared leaf
    // composite action rather than once per call site, so it is checked there directly
    // instead of multiplied by commands.length.
    const uploadVitestBlobAction = readFileSync(
      '.github/actions/upload-vitest-blob/action.yml',
      'utf8',
    )
    expect(uploadVitestBlobAction).toContain(
      'run: pnpm exec vouchington vitest-blob-manifest "$SUITE"',
    )
    expect(uploadVitestBlobAction).toContain(`path: |
          .vitest-reports/vitest-blob-manifest.json
          .vitest-reports/\${{ inputs.suite }}.json`)
    expect(uploadVitestBlobAction).toContain('if-no-files-found: error')
  })

  it('configures Vitest reporters and fan-in blob merging centrally', () => {
    const vitestConfig = readFileSync('vitest.config.mts', 'utf8')
    const reporterHelpers = readFileSync('test-helpers/vitest-ci-reporters.mts', 'utf8')
    const testsProcessingWorkflow = readFileSync(
      join(workflowDir, 'ci-tests-processing.yml'),
      'utf8',
    )
    const mergeVitestReportsScript = readFileSync('ci/merge-vitest-reports.sh', 'utf8')

    expect(vitestConfig).not.toContain("reporters: ['dot']")
    expect(vitestConfig).toContain("from './test-helpers/vitest-ci-reporters.mts'")
    expect(reporterHelpers).toContain('hanging-process')
    expect(reporterHelpers).toContain('createVitestWorkerExitDiagnosticsReporter()')
    expect(reporterHelpers).toContain("return ['minimal']")
    expect(reporterHelpers).toContain('enabled: false')
    expect(reporterHelpers).toContain('repository: process.env.GITHUB_REPOSITORY')
    expect(reporterHelpers).toContain('commitHash: process.env.GITHUB_SHA')
    expect(reporterHelpers).toContain('workspacePath: process.env.GITHUB_WORKSPACE')
    expect(reporterHelpers).toContain('onWritePath: normalizeGithubActionsPath')
    expect(reporterHelpers).toContain('Accepted values: run, merge.')
    expect(reporterHelpers).toContain('createVitestWorkerExitDiagnosticsReporter')

    expect(testsProcessingWorkflow).toContain('download-optional-run-artifacts.sh')
    expect(testsProcessingWorkflow).toContain(
      "--pattern 'vitest-blob-*' --dir './vitest-blob-fallback'",
    )
    expect(testsProcessingWorkflow).toContain(`name: Merge Vitest reports
        id: merge-vitest-reports
        if: "!cancelled() && (github.event_name == 'pull_request' || github.event_name == 'merge_group' || github.ref == 'refs/heads/main')"
        env:`)
    expect(testsProcessingWorkflow).not.toContain('merge-multiple: true')
    expect(testsProcessingWorkflow).toContain('VITEST_REPORT_EXPECTATIONS: ${{')
    expect(testsProcessingWorkflow).toContain('VITEST_CI_REPORTERS: merge')
    expect(testsProcessingWorkflow).toContain('run: ./ci/merge-vitest-reports.sh')
    expect(mergeVitestReportsScript).toContain('pnpm exec vouchington prepare-vitest-reports')
    expect(mergeVitestReportsScript).not.toContain('-maxdepth')
    expect(mergeVitestReportsScript).not.toContain("-name '*.json' -print0")
    expect(mergeVitestReportsScript).not.toContain('VITEST_JOBS_EXPECTED')
    expect(mergeVitestReportsScript).toContain(
      'pnpm exec vitest run --merge-reports="$merge_dir" --passWithNoTests',
    )
    expect(testsProcessingWorkflow).not.toContain('VITEST_MERGE_OUTCOME')
    expect(testsProcessingWorkflow).not.toContain('Vitest report merge failed')
  })

  it('keeps every Vitest blob fallback behind an explicit input and CI opt-in', () => {
    for (const file of blobWorkflowFiles) {
      const path = join(workflowDir, file)
      const source = readFileSync(path, 'utf8')
      const workflow = load(source) as {
        on?: {
          workflow_call?: {
            inputs?: Record<string, { default?: boolean; type?: string }>
          }
          workflow_dispatch?: {
            inputs?: Record<string, { default?: boolean; type?: string }>
          }
        }
      }

      expect(workflow.on?.workflow_call?.inputs?.upload_vitest_blob_artifact).toMatchObject({
        type: 'boolean',
        default: false,
      })
      expect(workflow.on?.workflow_dispatch?.inputs?.upload_vitest_blob_artifact).toMatchObject({
        type: 'boolean',
        default: false,
      })

      // Two composite-action calls per suite: attempt 1 and the attempt-2 retry.
      const expectedUploadStepCount =
        source.match(/uses: \.\/\.github\/actions\/upload-vitest-blob/g)?.length ?? 0
      expect(expectedUploadStepCount).toBeGreaterThan(0)
      expect(expectedUploadStepCount % 2).toBe(0)
      expect(
        vitestBlobStepBlocks(source).filter(
          step =>
            step.includes('!cancelled()') && step.includes('inputs.upload_vitest_blob_artifact'),
        ),
      ).toHaveLength(expectedUploadStepCount)
    }

    const ciWorkflow = readFileSync(join(workflowDir, 'ci.yml'), 'utf8')
    expect(ciWorkflow.match(/upload_vitest_blob_artifact: true/g)?.length).toBe(
      blobWorkflowFiles.length,
    )

    for (const file of workflowFiles.filter(file => /^main-.*\.ya?ml$/.test(file))) {
      const source = readFileSync(join(workflowDir, file), 'utf8')
      expect(source).not.toContain('upload_vitest_blob_artifact:')
    }
  })
})
