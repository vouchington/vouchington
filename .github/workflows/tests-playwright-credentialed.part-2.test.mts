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

const fixtureNow = 1_000_000

function captureJobDeadline(payload: unknown): {
  status: number | null
  output: string
  calls: string
} {
  const directory = mkdtempSync(join(tmpdir(), 'credentialed-job-clock-'))
  try {
    writeFileSync(
      join(directory, 'gh'),
      '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$API_CALLS"\nprintf "%s" "$API_RESPONSE"\n',
    )
    chmodSync(join(directory, 'gh'), 0o755)
    writeFileSync(join(directory, 'date'), '#!/usr/bin/env bash\nprintf "1000000\\n"\n')
    chmodSync(join(directory, 'date'), 0o755)
    writeFileSync(join(directory, 'env'), '')
    const capture = jobName
      ? parsedWorkflow.jobs?.[jobName]?.steps?.find(
          step => step.name === 'Capture current job deadline',
        )
      : undefined
    expect(capture?.run).toBeTypeOf('string')
    const result = spawnSync('bash', ['-c', capture!.run!], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        GITHUB_REPOSITORY: 'fixture/fixture',
        GITHUB_RUN_ID: '42',
        GITHUB_RUN_ATTEMPT: '2',
        GITHUB_JOB: 'playwright-credentialed-tests',
        RUNNER_NAME: 'owned-runner',
        RUNNER_TEMP: directory,
        GITHUB_ENV: join(directory, 'env'),
        API_RESPONSE: JSON.stringify(payload),
        API_CALLS: join(directory, 'calls'),
      },
    })
    expect(result.error).toBeUndefined()
    return {
      status: result.status,
      output: readFileSync(join(directory, 'env'), 'utf8'),
      calls: readFileSync(join(directory, 'calls'), 'utf8'),
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function ownedJob(startedAt: string) {
  return {
    id: 12,
    runner_id: 8,
    run_id: 42,
    run_attempt: 2,
    name: 'test-playwright-credentialed / playwright-credentialed-tests',
    runner_name: 'owned-runner',
    status: 'in_progress',
    started_at: startedAt,
  }
}

describe('credentialed job deadline uses a single current-attempt timing read', () => {
  it('includes provisioning elapsed time and reads the exact attempt once', () => {
    const startEpoch = fixtureNow - 480
    const result = captureJobDeadline({
      total_count: 1,
      jobs: [ownedJob(new Date(startEpoch * 1000).toISOString())],
    })
    expect(result.status).toBe(0)
    expect(result.output).toBe(`CREDENTIALED_JOB_DEADLINE_EPOCH=${startEpoch + 780}\n`)
    expect(result.calls.trim().split('\n')).toEqual([
      'api --method GET /repos/fixture/fixture/actions/runs/42/attempts/2/jobs?per_page=100',
    ])
  })

  it('rejects ambiguous matching job identities without exporting a deadline', () => {
    const job = ownedJob(new Date(fixtureNow * 1000).toISOString())
    const result = captureJobDeadline({ total_count: 2, jobs: [job, job] })
    expect(result.status).not.toBe(0)
    expect(result.output).toBe('')
  })

  it('rejects a wrong attempt and incomplete timing response without a deadline', () => {
    const job = { ...ownedJob(new Date(fixtureNow * 1000).toISOString()), run_attempt: 1 }
    expect(captureJobDeadline({ total_count: 1, jobs: [job] }).status).not.toBe(0)
    expect(captureJobDeadline({ total_count: 101, jobs: [] }).status).not.toBe(0)
  })

  it('fails before exporting a deadline when cleanup margin is already exhausted', () => {
    const job = ownedJob(new Date((fixtureNow - 780) * 1000).toISOString())
    const result = captureJobDeadline({ total_count: 1, jobs: [job] })
    expect(result.status).not.toBe(0)
    expect(result.output).toBe('')
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
