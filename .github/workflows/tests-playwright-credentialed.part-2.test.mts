import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

// Split out of tests-playwright-credentialed.test.mts to stay under the oxlint max-lines cap.
// Covers the "Run Playwright credentialed tests" step's retry/flake signal and the JUnit
// upload's condition (issue #51 follow-up), mirroring tests-playwright.part-2.test.mts.
const workflow = readFileSync('.github/workflows/tests-playwright-credentialed.yml', 'utf8')
const parsedWorkflow = load(workflow) as {
  jobs?: Record<string, { steps?: Array<{ id?: string; name?: string; run?: string }> }>
}
const jobName = Object.keys(parsedWorkflow.jobs ?? {}).find(name =>
  parsedWorkflow.jobs?.[name]?.steps?.some(
    step => step.name === 'Run Playwright credentialed tests',
  ),
)
const runStep = jobName
  ? parsedWorkflow.jobs?.[jobName]?.steps?.find(
      step => step.name === 'Run Playwright credentialed tests',
    )
  : undefined

function runScript(): string {
  expect(runStep?.run).toBeTypeOf('string')
  return (runStep?.run ?? '').replaceAll(/\$\{\{[^}]*\}\}/g, '1')
}

// Runs "Run Playwright credentialed tests" for real (against a stubbed pnpm) so the
// `test-results/**/trace.zip` scan and the `$GITHUB_OUTPUT` write can be observed end to end.
function runCredentialedStep({
  pnpmExitCode = 0,
  seedTraceZip,
}: {
  pnpmExitCode?: number
  seedTraceZip: boolean
}): { status: number | null; retried: string | undefined } {
  const cwd = mkdtempSync(join(tmpdir(), 'run-playwright-credentialed-step-'))
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
  const result = spawnSync('bash', ['-c', runScript()], {
    encoding: 'utf8',
    cwd,
    env: {
      ...process.env,
      GITHUB_OUTPUT: githubOutputPath,
      PATH: `${cwd}:${process.env['PATH'] ?? ''}`,
    },
  })
  const retried = readFileSync(githubOutputPath, 'utf8').match(/^retried=(true|false)$/m)?.[1]
  rmSync(cwd, { force: true, recursive: true })
  return { status: result.status, retried }
}

describe('tests-playwright-credentialed.yml retry/flake signal (issue #51)', () => {
  it('reports retried=false and exits 0 on a clean pass with no trace captured', () => {
    const { status, retried } = runCredentialedStep({ seedTraceZip: false })
    expect(status).toBe(0)
    expect(retried).toBe('false')
  })

  it('reports retried=true when a trace.zip exists under test-results/ (on-first-retry fired)', () => {
    const { status, retried } = runCredentialedStep({ seedTraceZip: true })
    expect(status).toBe(0)
    expect(retried).toBe('true')
  })

  it('still propagates a real Playwright failure exit code, independent of the retried output', () => {
    const { status, retried } = runCredentialedStep({ pnpmExitCode: 7, seedTraceZip: true })
    expect(status).toBe(7)
    expect(retried).toBe('true')
  })
})

describe('tests-playwright-credentialed.yml diagnostic upload condition (issue #51)', () => {
  it('uploads JUnit results on failure or a confirmed retry, never on a clean pass', () => {
    const index = workflow.indexOf('name: Upload JUnit test results')
    expect(index).toBeGreaterThan(-1)
    expect(workflow.slice(index, index + 700)).toContain(
      "if: ${{ !cancelled() && (failure() || steps.run-playwright-credentialed.outputs.retried == 'true') }}",
    )
  })

  it('keeps retention-days at 1 for the JUnit upload', () => {
    const index = workflow.indexOf('name: Upload JUnit test results')
    expect(workflow.slice(index, index + 1000)).toContain('retention-days: 1')
  })

  it('references the run-playwright-credentialed step id exactly, so retried resolves', () => {
    // steps.<id>.outputs.<name> only resolves when <id> matches a real step's `id:` in the
    // same job -- a typo here would silently evaluate to an empty string (never 'true'),
    // which would look identical to "never retried" instead of failing loudly.
    expect(runStep?.id).toBe('run-playwright-credentialed')
    const occurrences = workflow.match(/steps\.([a-zA-Z0-9_-]+)\.outputs\.retried/g) ?? []
    expect(occurrences.length).toBeGreaterThan(0)
    for (const occurrence of occurrences) {
      expect(occurrence).toBe(`steps.${runStep?.id}.outputs.retried`)
    }
  })
})
