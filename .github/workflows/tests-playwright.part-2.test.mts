import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

// Split out of tests-playwright.test.mts to stay under the oxlint max-lines cap. Covers the
// "Run Playwright tests" step's PW_FILES decode/quoting behavior specifically.
const workflow = readFileSync('.github/workflows/tests-playwright.yml', 'utf8')
const parsedWorkflow = load(workflow) as {
  jobs?: Record<string, { steps?: Array<{ id?: string; name?: string; run?: string }> }>
}
const runPlaywrightTestsScript = parsedWorkflow.jobs?.['playwright-tests']?.steps?.find(
  step => step.name === 'Run Playwright tests',
)?.run

// The real step script embeds unresolved `${{ matrix.shard }}`-style GHA expressions,
// which GitHub Actions substitutes before the shell ever sees the script — but which
// are not valid bash syntax on their own (bash parses `${{` as a bad substitution).
// Replacing every `${{ ... }}` token with a literal is safe for this test because it
// only exercises the PW_FILES decode/quoting logic, not the shard arithmetic itself.
function playwrightRunScript(): string {
  expect(runPlaywrightTestsScript).toBeTypeOf('string')
  return (runPlaywrightTestsScript ?? '').replaceAll(/\$\{\{[^}]*\}\}/g, '1')
}

// Stubs `pnpm` on PATH to capture the argv it would have received (NUL-delimited, so
// selected paths containing spaces or newlines round-trip exactly) instead of actually
// invoking Playwright.
function runPlaywrightPnpmArgs(env: { PW_FULL_SUITE: string; PW_FILES: string }): string[] {
  const directory = mkdtempSync(join(tmpdir(), 'run-playwright-tests-'))
  const argsPath = join(directory, 'pnpm-args')
  const pnpmStubPath = join(directory, 'pnpm')
  writeFileSync(pnpmStubPath, `#!/usr/bin/env bash\nprintf '%s\\0' "$@" > "${argsPath}"\n`)
  chmodSync(pnpmStubPath, 0o755)
  const result = spawnSync('bash', ['-c', playwrightRunScript()], {
    encoding: 'utf8',
    env: { ...process.env, ...env, PATH: `${directory}:${process.env['PATH'] ?? ''}` },
  })
  const raw = existsSync(argsPath) ? readFileSync(argsPath, 'utf8') : ''
  rmSync(directory, { force: true, recursive: true })
  expect(result.status).toBe(0)
  return raw.split('\0').filter(argument => argument.length > 0)
}

// Runs "Run Playwright tests" for real (against the stubbed pnpm above) with a working
// directory that stands in for the job's checkout, so the `test-results/**/trace.zip`
// scan and the `$GITHUB_OUTPUT` write can be observed end to end, not just the pnpm argv.
function runPlaywrightTestsStep({
  pnpmExitCode = 0,
  seedTraceZip,
}: {
  pnpmExitCode?: number
  seedTraceZip: boolean
}): { status: number | null; retried: string | undefined } {
  const cwd = mkdtempSync(join(tmpdir(), 'run-playwright-tests-step-'))
  const pnpmStubPath = join(cwd, 'pnpm')
  writeFileSync(pnpmStubPath, `#!/usr/bin/env bash\nexit ${pnpmExitCode}\n`)
  chmodSync(pnpmStubPath, 0o755)
  if (seedTraceZip) {
    const traceDir = join(cwd, 'test-results', 'some-test-retry1')
    mkdirSync(traceDir, { recursive: true })
    writeFileSync(join(traceDir, 'trace.zip'), '')
  }
  const githubOutputPath = join(cwd, 'github-output')
  writeFileSync(githubOutputPath, '')
  const result = spawnSync('bash', ['-c', playwrightRunScript()], {
    encoding: 'utf8',
    cwd,
    env: {
      ...process.env,
      PW_FULL_SUITE: 'true',
      PW_FILES: '',
      GITHUB_OUTPUT: githubOutputPath,
      PATH: `${cwd}:${process.env['PATH'] ?? ''}`,
    },
  })
  const retried = readFileSync(githubOutputPath, 'utf8').match(/^retried=(true|false)$/m)?.[1]
  rmSync(cwd, { force: true, recursive: true })
  return { status: result.status, retried }
}

describe('tests-playwright.yml retry/flake signal (issue #51)', () => {
  it('reports retried=false and exits 0 on a clean pass with no trace captured', () => {
    const { status, retried } = runPlaywrightTestsStep({ seedTraceZip: false })
    expect(status).toBe(0)
    expect(retried).toBe('false')
  })

  it('reports retried=true when a trace.zip exists under test-results/ (on-first-retry fired)', () => {
    const { status, retried } = runPlaywrightTestsStep({ seedTraceZip: true })
    expect(status).toBe(0)
    expect(retried).toBe('true')
  })

  it('still propagates a real Playwright failure exit code, independent of the retried output', () => {
    const { status, retried } = runPlaywrightTestsStep({ pnpmExitCode: 7, seedTraceZip: true })
    expect(status).toBe(7)
    expect(retried).toBe('true')
  })
})

describe('tests-playwright.yml PW_FILES selection', () => {
  it('runs unfiltered when full-suite, ignoring any stray PW_FILES value', () => {
    const args = runPlaywrightPnpmArgs({ PW_FULL_SUITE: 'true', PW_FILES: '' })
    expect(args).toEqual([
      'exec',
      './ci/with-node-test-options',
      'playwright',
      'test',
      '--shard=1/1',
    ])
  })

  it('runs unfiltered when PW_FILES is empty even if full-suite is false (fail-open)', () => {
    const args = runPlaywrightPnpmArgs({ PW_FULL_SUITE: 'false', PW_FILES: '' })
    expect(args).toEqual([
      'exec',
      './ci/with-node-test-options',
      'playwright',
      'test',
      '--shard=1/1',
    ])
  })

  it('passes through an explicit narrowed selection as positional args before the shard flag', () => {
    const args = runPlaywrightPnpmArgs({
      PW_FULL_SUITE: 'false',
      PW_FILES: 'playwright/tests/foo.spec.mts\nplaywright/tests/bar.spec.mts',
    })
    expect(args).toEqual([
      'exec',
      './ci/with-node-test-options',
      'playwright',
      'test',
      'playwright/tests/foo.spec.mts',
      'playwright/tests/bar.spec.mts',
      '--shard=1/1',
    ])
  })

  it('preserves selected file paths containing spaces or shell glob metacharacters', () => {
    // PW_FILES is newline-delimited (vouchington-tooling/gha-selected-files's encodeSelectedFiles);
    // a space or a glob metacharacter (*, ?, [) inside a single path must survive the
    // quoted read-loop decode unchanged, not be word-split or glob-expanded the way an
    // unquoted $PW_FILES previously was.
    const args = runPlaywrightPnpmArgs({
      PW_FULL_SUITE: 'false',
      PW_FILES:
        'playwright/tests/[id]/foo.spec.mts\nplaywright/tests/needs space/bar.spec.mts\nplaywright/tests/glob-*-star.spec.mts',
    })
    expect(args).toEqual([
      'exec',
      './ci/with-node-test-options',
      'playwright',
      'test',
      'playwright/tests/[id]/foo.spec.mts',
      'playwright/tests/needs space/bar.spec.mts',
      'playwright/tests/glob-*-star.spec.mts',
      '--shard=1/1',
    ])
  })

  it('compiles the localization catalog after the web build and before Playwright starts', () => {
    const shardJob = workflow.match(/\n {2}playwright-tests:[\s\S]*?(?=\n {2}[a-zA-Z0-9_-]+:\n|$)/)
    expect(shardJob).not.toBeNull()
    const body = shardJob![0]
    const build = body.indexOf('uses: ./.github/actions/build-web-targets')
    const compile = body.indexOf('Compile localization catalog')
    const run = body.indexOf('Run Playwright tests')
    expect(build).toBeGreaterThan(-1)
    expect(compile).toBeGreaterThan(build)
    expect(compile).toBeLessThan(run)
    expect(body).toContain('compile-cli.mts')
    expect(body).toContain('/dev/shm')
    expect(body).toContain('LOCALIZATION_SQLITE_PATH')
  })
})

describe('tests-playwright.yml diagnostic upload conditions (issue #51)', () => {
  const UPLOAD_CONDITION =
    "if: ${{ !cancelled() && (failure() || steps.run-playwright.outputs.retried == 'true') }}"

  it('uploads JUnit, test-results, and wrangler logs on failure or a confirmed retry, never on a clean pass', () => {
    // A flaky test that fails then passes on retry makes the job exit 0, so a bare `failure()`
    // guard never fires for these three steps and nothing gets uploaded. But a bare
    // `!cancelled()` reintroduces a different bug: cleanup-artifacts fans in whenever the whole
    // run goes green and deletes these exact artifact names right back out, so a clean run
    // would upload something only to have it deleted moments later. Gating on
    // `failure() || retried == 'true'` means a clean run uploads nothing at all, while a failed
    // or flaky-and-retried run still uploads and (per the cleanup-artifacts-patterns.json change
    // in this same PR) survives the green-run cleanup sweep.
    const shardJob = workflow.match(/\n {2}playwright-tests:[\s\S]*?(?=\n {2}[a-zA-Z0-9_-]+:\n|$)/)
    expect(shardJob).not.toBeNull()
    const body = shardJob![0]

    for (const stepName of [
      'Upload JUnit test results',
      'Upload Playwright test-results (traces, screenshots, videos)',
      'Upload wrangler logs',
    ]) {
      const index = body.indexOf(`name: ${stepName}`)
      expect(index).toBeGreaterThan(-1)
      expect(body.slice(index, index + 700)).toContain(UPLOAD_CONDITION)
    }

    // The port-collision diagnostic keeps its own, narrower failure() guard, unrelated to the
    // uploads' retried signal.
    const portDiagnosticIndex = body.indexOf('name: Diagnose browser port collision')
    expect(portDiagnosticIndex).toBeGreaterThan(-1)
    expect(body.slice(portDiagnosticIndex, portDiagnosticIndex + 200)).toContain(
      'if: ${{ failure() && env.BROWSER_ALLOCATED_PORTS',
    )
  })

  it('keeps retention-days at 1 for the diagnostic uploads', () => {
    const shardJob = workflow.match(/\n {2}playwright-tests:[\s\S]*?(?=\n {2}[a-zA-Z0-9_-]+:\n|$)/)
    const body = shardJob![0]
    const junitIndex = body.indexOf('name: Upload JUnit test results')
    const resultsIndex = body.indexOf('name: Upload Playwright test-results')
    const wranglerIndex = body.indexOf('name: Upload wrangler logs')
    for (const index of [junitIndex, resultsIndex, wranglerIndex]) {
      expect(body.slice(index, index + 1000)).toContain('retention-days: 1')
    }
  })

  it('references the run-playwright step id exactly, so the retried output actually resolves', () => {
    // steps.<id>.outputs.<name> only resolves when <id> matches a real step's `id:` in the
    // same job -- a typo here would silently evaluate to an empty string (never 'true'),
    // which would look identical to "never retried" instead of failing loudly.
    const runStep = parsedWorkflow.jobs?.['playwright-tests']?.steps?.find(
      step => step.name === 'Run Playwright tests',
    )
    expect(runStep?.id).toBe('run-playwright')

    const shardJob = workflow.match(/\n {2}playwright-tests:[\s\S]*?(?=\n {2}[a-zA-Z0-9_-]+:\n|$)/)
    const body = shardJob![0]
    const occurrences = body.match(/steps\.([a-zA-Z0-9_-]+)\.outputs\.retried/g) ?? []
    expect(occurrences.length).toBeGreaterThan(0)
    for (const occurrence of occurrences) {
      expect(occurrence).toBe(`steps.${runStep?.id}.outputs.retried`)
    }
  })
})
