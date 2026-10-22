import {
  existsSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

// Split out of tests-playwright-credentialed.test.mts to stay under the oxlint max-lines cap.
// Covers the "Run Playwright credentialed tests" step's retry/flake signal and the JUnit
// upload's condition (issue #51 follow-up), mirroring tests-playwright.part-2.test.mts.
const workflow = readFileSync('.github/workflows/tests-playwright-credentialed.yml', 'utf8')
const parsedWorkflow = load(workflow) as {
  jobs?: Record<
    string,
    {
      'timeout-minutes'?: number
      steps?: Array<{ id?: string; if?: string; name?: string; run?: string; uses?: string }>
    }
  >
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
  remainingSeconds = 650,
}: {
  pnpmExitCode?: number
  seedTraceZip: boolean
  remainingSeconds?: number
}): {
  status: number | null
  retried: string | undefined
  launched: boolean
  budget: string | undefined
} {
  const cwd = mkdtempSync(join(tmpdir(), 'run-playwright-credentialed-step-'))
  const pnpmStubPath = join(cwd, 'pnpm')
  writeFileSync(
    pnpmStubPath,
    `#!/usr/bin/env bash\nprintf "started" > "$COMMAND_STARTED"\nexit ${pnpmExitCode}\n`,
  )
  chmodSync(pnpmStubPath, 0o755)
  writeFileSync(join(cwd, 'date'), '#!/usr/bin/env bash\nprintf "1000000\\n"\n')
  chmodSync(join(cwd, 'date'), 0o755)
  if (seedTraceZip) {
    const traceDir = join(cwd, 'test-results', 'some-test-retry1')
    mkdirSync(traceDir, { recursive: true })
    writeFileSync(join(traceDir, 'trace.zip'), '')
  }
  const python = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], {
    encoding: 'utf8',
    timeout: 2000,
  })
  expect(python.status).toBe(0)
  writeFileSync(
    join(cwd, 'python3'),
    '#!/usr/bin/env bash\nprintf "%s" "$2" > "$COMMAND_BUDGET"\nexec "$REAL_PYTHON" "$@"\n',
  )
  chmodSync(join(cwd, 'python3'), 0o755)
  const githubOutputPath = join(cwd, 'github-output')
  writeFileSync(githubOutputPath, '')
  const result = spawnSync('bash', ['-c', runScript()], {
    encoding: 'utf8',
    timeout: 5000,
    cwd,
    env: {
      ...process.env,
      GITHUB_OUTPUT: githubOutputPath,
      COMMAND_STARTED: join(cwd, 'command-started'),
      COMMAND_BUDGET: join(cwd, 'command-budget'),
      REAL_PYTHON: python.stdout.trim(),
      GITHUB_WORKSPACE: resolve('.'),
      CREDENTIALED_JOB_DEADLINE_EPOCH: String(1000000 + 130 + remainingSeconds),
      PATH: `${cwd}:${process.env['PATH'] ?? ''}`,
    },
  })
  const retried = readFileSync(githubOutputPath, 'utf8').match(/^retried=(true|false)$/m)?.[1]
  const launched = existsSync(join(cwd, 'command-started'))
  const budget = existsSync(join(cwd, 'command-budget'))
    ? readFileSync(join(cwd, 'command-budget'), 'utf8')
    : undefined
  rmSync(cwd, { force: true, recursive: true })
  return { status: result.status, retried, launched, budget }
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

describe('tests-playwright-credentialed.yml JUnit report retention', () => {
  it('uploads JUnit results on every non-cancelled run without changing the test outcome', () => {
    const index = workflow.indexOf('name: Upload JUnit test results')
    expect(index).toBeGreaterThan(-1)
    expect(workflow.slice(index, index + 700)).toContain('if: ${{ !cancelled() }}')
    expect(workflow.slice(index, index + 700)).toContain('continue-on-error: true')
    expect(workflow.slice(index, index + 1000)).toContain('retention-days: 1')
  })
})

const fixtureNow = 1_000_000
const failureAfterCheckout = "${{ failure() && steps.checkout.outcome == 'success' }}"

function captureRun(): string {
  const capture = jobName
    ? parsedWorkflow.jobs?.[jobName]?.steps?.find(
        step => step.name === 'Capture current job deadline',
      )
    : undefined
  expect(capture?.run).toBeTypeOf('string')
  return capture?.run ?? ''
}

function runCapture(): { status: number | null; output: string } {
  const directory = mkdtempSync(join(tmpdir(), 'credentialed-job-clock-'))
  try {
    writeFileSync(join(directory, 'date'), '#!/usr/bin/env bash\nprintf "1000000\\n"\n')
    chmodSync(join(directory, 'date'), 0o755)
    writeFileSync(join(directory, 'env'), '')
    const result = spawnSync('bash', ['-c', captureRun()], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        GITHUB_ENV: join(directory, 'env'),
      },
    })
    expect(result.error).toBeUndefined()
    return {
      status: result.status,
      output: readFileSync(join(directory, 'env'), 'utf8'),
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('credentialed job deadline uses the runner clock', () => {
  it('adds the job timeout to the local clock and does not read the jobs list', () => {
    const job = jobName ? parsedWorkflow.jobs?.[jobName] : undefined
    const timeoutMinutes = job?.['timeout-minutes']
    expect(timeoutMinutes).toBeTypeOf('number')
    const run = captureRun()
    expect(run).not.toContain('gh ')
    expect(run).toContain(`deadline=$((now + ${timeoutMinutes} * 60))`)
    const result = runCapture()
    expect(result.status).toBe(0)
    expect(result.output).toBe(
      `CREDENTIALED_JOB_DEADLINE_EPOCH=${fixtureNow + (timeoutMinutes ?? 0) * 60}\n`,
    )
  })

  it('prints Valkey logs only after checkout has succeeded', () => {
    const steps = jobName ? parsedWorkflow.jobs?.[jobName]?.steps : undefined
    const checkout = steps?.find(step => step.uses?.startsWith('actions/checkout@'))
    const logs = steps?.find(step => step.uses === './.github/actions/valkey-logs')
    expect(checkout?.id).toBe('checkout')
    expect(logs?.if).toBe(failureAfterCheckout)
  })

  it('retains real command failure status with reduced remaining headroom', () => {
    const result = runCredentialedStep({
      pnpmExitCode: 7,
      seedTraceZip: false,
      remainingSeconds: 170,
    })
    expect(result.status).toBe(7)
    expect(result.retried).toBe('false')
    expect(result.launched).toBe(true)
    expect(result.budget).toBe('170')
  })

  it('fails before the credentialed command when no safe remaining budget exists', () => {
    const result = runCredentialedStep({ seedTraceZip: false, remainingSeconds: 0 })
    expect(result.status).not.toBe(0)
    expect(result.retried).toBeUndefined()
    expect(result.launched).toBe(false)
    expect(result.budget).toBeUndefined()
  })
})
