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

// Covers the "Run Playwright tests" step's shard invocation and retry signal.
const workflow = readFileSync('.github/workflows/tests-playwright.yml', 'utf8')
const parsedWorkflow = load(workflow) as {
  jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>
}
const runPlaywrightTestsScript = parsedWorkflow.jobs?.['playwright-tests']?.steps?.find(
  step => step.name === 'Run Playwright tests',
)?.run

// The real step script embeds unresolved `${{ matrix.shard }}`-style GHA expressions,
// which GitHub Actions substitutes before the shell ever sees the script — but which
// are not valid bash syntax on their own (bash parses `${{` as a bad substitution).
// Replacing every `${{ ... }}` token with a literal is safe for this test because it
// only exercises the shell script, not the shard arithmetic itself.
function playwrightRunScript(): string {
  expect(runPlaywrightTestsScript).toBeTypeOf('string')
  return (runPlaywrightTestsScript ?? '').replaceAll(/\$\{\{[^}]*\}\}/g, '1')
}

// Stubs `pnpm` on PATH to capture the argv it would have received (NUL-delimited) instead
// of actually invoking Playwright.
function runPlaywrightPnpmArgs(env: { CI_SHARD: string }): string[] {
  const directory = mkdtempSync(join(tmpdir(), 'run-playwright-tests-'))
  const argsPath = join(directory, 'pnpm-args')
  const pnpmStubPath = join(directory, 'pnpm')
  writeFileSync(pnpmStubPath, `#!/usr/bin/env bash\nprintf '%s\\0' "$@" > "${argsPath}"\n`)
  chmodSync(pnpmStubPath, 0o755)
  const result = spawnSync('bash', ['-c', playwrightRunScript()], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      GITHUB_WORKSPACE: process.cwd(),
      PATH: `${directory}:${process.env['PATH'] ?? ''}`,
    },
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
      CI_SHARD: '1/1',
      GITHUB_OUTPUT: githubOutputPath,
      GITHUB_WORKSPACE: process.cwd(),
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

describe('tests-playwright.yml shard invocation', () => {
  it('runs the whole suite for the matrix shard', () => {
    const args = runPlaywrightPnpmArgs({ CI_SHARD: '2/6' })
    expect(args).toEqual([
      'exec',
      './ci/with-node-test-options',
      'playwright',
      'test',
      '--shard=2/6',
    ])
  })
})

// Monitor mode puts the background sampler in its own process group, so a
// leftover `sleep 30` is not in the step's group. This wrapper records the pid
// and execs the real binary; a pid still alive after the step exits is the
// orphan the runner would terminate.
function recordSleepThenExec(): string {
  return [
    '#!/usr/bin/env bash',
    'printf \'%s %s\\n\' "$$" "$*" >> "$SAMPLER_SLEEP_LOG"',
    'exec "$SAMPLER_SLEEP_BIN" "$@"',
    '',
  ].join('\n')
}

function realSleepBinary(): string {
  const found = spawnSync('bash', ['-c', 'PATH=/usr/bin:/bin command -v sleep'], {
    encoding: 'utf8',
  })
  expect(found.status).toBe(0)
  const path = found.stdout.trim()
  expect(path.startsWith('/')).toBe(true)
  return path
}

function survivingSleeps(logPath: string): string[] {
  const survivors: string[] = []
  for (const line of readFileSync(logPath, 'utf8').split('\n')) {
    const match = /^(\d+) (\S+)$/.exec(line.trim())
    if (match?.[1] === undefined) continue
    const listed = spawnSync('ps', ['-p', match[1], '-o', 'pid=,command='], { encoding: 'utf8' })
    if (listed.status === 0 && listed.stdout.trim().length > 0) survivors.push(listed.stdout.trim())
    spawnSync('kill', ['-KILL', match[1]])
  }
  return survivors
}

// The step backgrounds `sleep 30` to sample memory. macOS has no /proc/meminfo,
// so the script under test is pointed at a fixture file.
function runSamplerStep(pnpmExitCode: number): {
  orphans: string[]
  startedSampler: boolean
  status: number | null
} {
  const cwd = mkdtempSync(join(tmpdir(), 'playwright-sampler-'))
  const meminfo = join(cwd, 'meminfo')
  writeFileSync(meminfo, 'MemAvailable: 1048576 kB\nSwapFree: 1048576 kB\n')
  const sleepLog = join(cwd, 'sleep-log')
  writeFileSync(sleepLog, '')
  const sleepStub = join(cwd, 'sleep')
  writeFileSync(sleepStub, recordSleepThenExec())
  chmodSync(sleepStub, 0o755)
  const script = playwrightRunScript().replaceAll('/proc/meminfo', meminfo)
  const pnpmStubPath = join(cwd, 'pnpm')
  writeFileSync(pnpmStubPath, `#!/usr/bin/env bash\nsleep 0.4\nexit ${pnpmExitCode}\n`)
  chmodSync(pnpmStubPath, 0o755)
  const githubOutputPath = join(cwd, 'github-output')
  writeFileSync(githubOutputPath, '')
  const result = spawnSync('bash', ['-c', script], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI_SHARD: '1/1',
      GITHUB_OUTPUT: githubOutputPath,
      GITHUB_WORKSPACE: process.cwd(),
      PATH: `${cwd}:${process.env['PATH'] ?? ''}`,
      SAMPLER_SLEEP_BIN: realSleepBinary(),
      SAMPLER_SLEEP_LOG: sleepLog,
    },
  })
  const startedSampler = readFileSync(sleepLog, 'utf8')
    .split('\n')
    .some(line => line.trim().endsWith(' 30'))
  const orphans = survivingSleeps(sleepLog)
  rmSync(cwd, { force: true, recursive: true })
  return { orphans, startedSampler, status: result.status }
}

describe('tests-playwright.yml memory sampler', () => {
  it('reaps the sampler sleep before the step exits', () => {
    const { orphans, startedSampler, status } = runSamplerStep(0)
    expect(status).toBe(0)
    expect(startedSampler).toBe(true)
    expect(orphans).toEqual([])
  })

  it('keeps a Playwright failure when the sampler is running', () => {
    const { orphans, startedSampler, status } = runSamplerStep(7)
    expect(status).toBe(7)
    expect(startedSampler).toBe(true)
    expect(orphans).toEqual([])
  })
})
