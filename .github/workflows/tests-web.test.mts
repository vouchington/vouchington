import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/tests-web.yml', 'utf8')
const parsedWorkflow = load(workflow) as {
  on?: {
    workflow_call?: { inputs?: Record<string, { default?: boolean | string; type?: string }> }
    workflow_dispatch?: { inputs?: Record<string, { default?: boolean | string; type?: string }> }
  }
  permissions?: Record<string, string>
  jobs?: Record<string, { permissions?: Record<string, string> }>
}
const stepsWorkflow = load(workflow) as {
  jobs?: Record<
    string,
    { steps?: Array<{ env?: Record<string, string>; name?: string; run?: string }> }
  >
}
const runWebTestsScript = stepsWorkflow.jobs?.['web-tests']?.steps?.find(
  step => step.name === 'Run web tests',
)?.run

// Isolates the FILES-array-computation prefix of the "Run web tests" step (everything
// before the `pnpm exec ... vitest run` invocation) so it can be exercised directly,
// without actually running Vitest.
function filesArrayScript(): string {
  expect(runWebTestsScript).toBeTypeOf('string')
  const script = runWebTestsScript ?? ''
  const pnpmLineIndex = script.indexOf('pnpm exec ./ci/with-node-test-options vitest run')
  expect(pnpmLineIndex).toBeGreaterThan(0)
  return script.slice(0, pnpmLineIndex)
}

function runFilesArray(env: { FULL_SUITE: string; SELECTED_TEST_FILES: string }): string[] {
  const script = `${filesArrayScript()}printf '%s\\n' "\${FILES[@]}"`
  const result = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  expect(result.status).toBe(0)
  return result.stdout.split('\n').filter(line => line.length > 0)
}

function jobSection(jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('Web Tests workflow', () => {
  it('runs tests by default for reusable and manual invocations', () => {
    expect(parsedWorkflow.on?.workflow_call?.inputs?.run_tests).toMatchObject({
      type: 'boolean',
      default: true,
    })
    expect(parsedWorkflow.on?.workflow_dispatch?.inputs?.run_tests).toMatchObject({
      type: 'boolean',
      default: true,
    })
    expect(parsedWorkflow.on?.workflow_dispatch?.inputs?.shard_total_override).toMatchObject({
      type: 'string',
      default: '',
    })
  })

  it('grants artifact read only to the coverage-publishing web test shards', () => {
    expect(parsedWorkflow.permissions).toEqual({ contents: 'read' })
    expect(parsedWorkflow.jobs?.prep?.permissions).toEqual({ contents: 'read' })
    expect(parsedWorkflow.jobs?.['web-tests']?.permissions).toEqual({
      actions: 'read',
      contents: 'read',
    })
  })

  it('prepares a configurable web test shard matrix on ubuntu-latest', () => {
    const prep = jobSection('prep')

    expect(prep).toContain('runs-on: ubuntu-latest')
    expect(prep).toContain('uses: ./.github/actions/make-shard-matrix')
    expect(prep).toContain('node ci/vitest/shard-total.mts test-web')
    expect(prep).toContain('FILES_PER_SHARD_OVERRIDE: ${{ vars.TEST_WEB_FILES_PER_SHARD }}')
    expect(prep).toContain('total: ${{ steps.shard-total.outputs.shard-total }}')
    expect(prep).toContain('shard-matrix: ${{ steps.shards.outputs.matrix }}')
    expect(prep).toContain('shard-total: ${{ steps.shards.outputs.total }}')
  })

  it('runs dynamically sized Vitest shards on ubuntu-latest with the web-owned four-worker policy', () => {
    const tests = jobSection('web-tests')

    expect(tests).toContain('needs: [prep]')
    expect(tests).toContain('runs-on: ubuntu-latest')
    expect(tests).toContain('fail-fast: false')
    expect(tests).toContain('shard: ${{ fromJSON(needs.prep.outputs.shard-matrix) }}')
    expect(tests).toContain("VITEST_MAX_WORKERS: '4'")
    expect(tests).toContain(
      'vitest run --bail=3 --project web --shard ${{ matrix.shard }}/${{ needs.prep.outputs.shard-total }} --passWithNoTests "${FILES[@]}"',
    )
    // Worker count is never a CLI flag here — the root vitest.config.mts computes
    // `maxWorkers: parseVitestMaxWorkers(process.env.VITEST_MAX_WORKERS)` for every project,
    // and this workflow owns its four-worker override in the job environment.
    expect(tests).not.toMatch(/--maxWorkers/)
    expect(tests).toContain(
      "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}",
    )
    expect(tests).not.toContain('--coverage')
  })

  it('no longer runs the pages-router, dependency, typecheck, build, or smoke checks (moved to checks-static.yml)', () => {
    for (const stepName of [
      'Next.js pages-router check',
      'Check web dependencies',
      'Typecheck web',
      'Build web',
      'Smoke test web',
    ]) {
      expect(workflow).not.toContain(`name: ${stepName}`)
    }
    expect(workflow).not.toContain('\n  web-checks:')
    expect(workflow).not.toContain(
      'pnpm exec depcruise --config web/.dependency-cruiser.cjs --output-type err --cache --cache-strategy content web',
    )
    expect(workflow).not.toContain('pnpm exec next typegen && pnpm exec tsc --noEmit --incremental')
    expect(workflow).not.toContain('pnpm run build')
    expect(workflow).not.toContain('smoke-test-web.sh')
  })

  it('uses shard-specific test and coverage artifacts', () => {
    const tests = jobSection('web-tests')

    expect(tests).toContain('VITEST_JUNIT_OUTPUT_FILE: web-shard-${{matrix.shard}}.junit.xml')
    expect(tests).toContain(
      'VITEST_BLOB_OUTPUT_FILE: .vitest-reports/web-shard-${{matrix.shard}}.json',
    )
    expect(tests).toContain('uses: ./.github/actions/upload-vitest-blob')
    expect(tests).toContain('name: web-test-report-shard-${{ matrix.shard }}')
    expect(tests).toContain(
      'run: node ci/artifact-upload-outcome.mts "$FAMILY" "$SUITE" "$FIRST_OUTCOME" "$RETRY_OUTCOME"',
    )
    expect(tests).toContain('SUITE: web-shard-${{ matrix.shard }}')
    expect(tests).toContain('FIRST_OUTCOME: ${{ steps.coverage-fallback-1-1.outcome }}')
    expect(tests).toContain('RETRY_OUTCOME: ${{ steps.coverage-fallback-2-1.outcome }}')
    expect(tests).toContain('uses: ./.github/actions/upload-coverage-pair')
    expect(tests).toContain('suite: web-shard-${{ matrix.shard }}')
    expect(tests).toContain('fallback attempt 2')
  })

  it('stamps web coverage with the prepared shard total', () => {
    const stamp = stepsWorkflow.jobs?.['web-tests']?.steps?.find(
      step => step.name === 'Stamp web-shard-${{ matrix.shard }} coverage provenance',
    )

    expect(stamp?.env).toMatchObject({
      CI_SHARD: '${{ matrix.shard }}/${{ needs.prep.outputs.shard-total }}',
      PR_BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      PR_HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    })
  })

  it('never round-trips the Vite transform cache through actions/cache on the self-hosted runner', () => {
    const tests = jobSection('web-tests')

    expect(tests).not.toContain('Restore Vite transform cache')
    expect(tests).not.toContain('Check Vite cache size')
    expect(tests).not.toContain('Save Vite transform cache')
    expect(tests).not.toContain('.cache/vite/vitest')
    expect(tests).not.toContain('actions/cache')
    expect(tests).not.toContain('matrix.shard == 1')
  })

  it('installs shared TypeScript package dependencies for Vite source aliases', () => {
    const tests = jobSection('web-tests')

    expect(tests).toContain('uses: ./.github/actions/setup-node-pnpm')
    expect(tests).not.toContain('pnpm install ')
  })

  it('runs Vitest on every shard right after dependency install, with no gates after it', () => {
    const tests = jobSection('web-tests')
    const install = tests.indexOf('uses: ./.github/actions/setup-node-pnpm')
    const runTests = tests.indexOf('      - name: Run web tests')
    const uploadBlob = tests.indexOf(
      'name: Upload web-shard-${{ matrix.shard }} vitest blob to GitHub (fallback)',
    )

    expect(install).toBeGreaterThanOrEqual(0)
    expect(runTests).toBeGreaterThan(install)
    expect(uploadBlob).toBeGreaterThan(runTests)
  })

  it('resolves an unfiltered run for full_suite even when selected_test_files is unset', () => {
    // Regression test: a `full_suite && '' || (selected || sentinel)` GHA expression
    // here previously discarded the intentional empty string (falsy in GHA, same as
    // JS) and fell through to the sentinel — every full_suite=true push (the default,
    // used by every main push) silently selected zero test files. This exercises the
    // real bash conditional that replaced it, not just the YAML text.
    expect(runFilesArray({ FULL_SUITE: 'true', SELECTED_TEST_FILES: '' })).toEqual([])
  })

  it('passes through an explicit narrowed selection', () => {
    expect(
      runFilesArray({
        FULL_SUITE: 'false',
        SELECTED_TEST_FILES: 'web/foo.test.tsx\nweb/bar.test.tsx',
      }),
    ).toEqual(['web/foo.test.tsx', 'web/bar.test.tsx'])
  })

  it('falls back to a non-matching sentinel when narrowed with no selection', () => {
    expect(runFilesArray({ FULL_SUITE: 'false', SELECTED_TEST_FILES: '' })).toEqual([
      'NO_TESTS_MATCHING_SELECTION',
    ])
  })

  it('preserves selected file paths containing spaces or shell glob metacharacters', () => {
    // SELECTED_TEST_FILES is newline-delimited (vouchington-tooling/gha-selected-files's
    // encodeSelectedFiles); a space or a glob metacharacter (*, ?, [) inside a single
    // path must survive the quoted read-loop decode unchanged, not be word-split or
    // glob-expanded the way an unquoted $VAR previously was.
    expect(
      runFilesArray({
        FULL_SUITE: 'false',
        SELECTED_TEST_FILES:
          'web/components/[id]/foo.test.tsx\nweb/components/needs space/bar.test.tsx\nweb/components/glob-*-star.test.tsx',
      }),
    ).toEqual([
      'web/components/[id]/foo.test.tsx',
      'web/components/needs space/bar.test.tsx',
      'web/components/glob-*-star.test.tsx',
    ])
  })
})
