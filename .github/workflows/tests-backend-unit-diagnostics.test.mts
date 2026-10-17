import { spawn, spawnSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parse as load } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { formatBackendUnitFileProgress } from '../../test-helpers/vitest-file-progress-reporter.mts'

const workflow = load(readFileSync('.github/workflows/tests-backend-unit.yml', 'utf8')) as {
  jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>
}

describe('backend-unit sampler opt-in', () => {
  it('starts samplers only for diagnostics=1 without changing the test command status', () => {
    const runScript = workflow.jobs?.['backend-tests']?.steps?.find(
      step => step.name === 'Run backend tests',
    )?.run
    const samplerBlock = /if \[ "\$VITEST_DIAGNOSTICS" = 1 \]; then\n[\s\S]*?\nfi/u.exec(
      runScript ?? '',
    )?.[0]
    expect(samplerBlock).toBeDefined()
    const script = `start_sampler() { printf '%s\\n' "$1"; }\n${samplerBlock}\nexit 17`
    const env = { ...process.env }
    delete env.VITEST_DIAGNOSTICS

    for (const value of [undefined, '0', '1']) {
      const result = spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: value === undefined ? env : { ...env, VITEST_DIAGNOSTICS: value },
      })
      expect(result.status).toBe(17)
      expect(result.stderr).toBe('')
      expect(result.stdout.trim().split('\n').filter(Boolean)).toEqual(
        value === '1'
          ? ['sample_runner_resources', 'sample_postgres_waits', 'sample_runner_pressure']
          : [],
      )
    }
  })
})

describe('datastore workflow diagnostics opt-in', () => {
  it.each([
    ['tests-web-api.yml', 'web-api-tests', 'Run web API tests'],
    ['tests-web-integration.yml', 'web-integration-tests', 'Run web integration tests'],
    ['tests-postgres-schema.yml', 'postgres-schema-tests', 'Run PostgreSQL schema tests'],
  ])(
    '%s forwards the repository opt-in without enabling diagnostics by default',
    (file, jobId, name) => {
      const parsed = load(readFileSync(`.github/workflows/${file}`, 'utf8')) as {
        jobs: Record<string, { steps: Array<{ name?: string; env?: Record<string, string> }> }>
      }
      const step = parsed.jobs[jobId]?.steps.find(candidate => candidate.name === name)
      expect(step).toBeDefined()
      expect(step?.env?.VITEST_DIAGNOSTICS).toBe(
        "${{ vars.VITEST_DIAGNOSTICS == '1' && '1' || '0' }}",
      )
    },
  )
})

describe('backend-unit deadline dump', () => {
  type Step = {
    name?: string
    'timeout-minutes'?: number
    env?: Record<string, string>
    if?: string
  }
  const steps = (workflow.jobs?.['backend-tests']?.steps ?? []) as Step[]
  const sleepPids: number[] = []

  afterEach(() => {
    const leaked = sleepPids.splice(0).map(String)
    if (leaked.length > 0) spawnSync('kill', leaked, { stdio: 'ignore' })
  })

  it('fires 60 seconds before the step timeout and keeps the job cap below the step sum', () => {
    const step = steps.find(candidate => candidate.name === 'Run backend tests')
    expect(Number(step?.env?.DEADLINE_DUMP_AFTER_SECONDS)).toBe(
      (step?.['timeout-minutes'] ?? 0) * 60 - 60,
    )
    const parsed = load(readFileSync('.github/workflows/tests-backend-unit.yml', 'utf8')) as {
      jobs: Record<string, { 'timeout-minutes': number }>
    }
    const stepSum = steps.reduce((sum, candidate) => sum + (candidate['timeout-minutes'] ?? 0), 0)
    expect(parsed.jobs['backend-tests']?.['timeout-minutes']).toBeLessThan(stepSum)
  })

  it('names the unfinished file and the largest processes when the deadline fires', () => {
    const runScript = steps.find(candidate => candidate.name === 'Run backend tests') as
      | { run?: string }
      | undefined
    const definitions = (runScript?.run ?? '').split('trap stop_samplers EXIT')[0]
    const dir = mkdtempSync(path.join(tmpdir(), 'deadline-'))
    const progress = path.join(dir, 'progress.log')
    writeFileSync(progress, formatBackendUnitFileProgress('start', 'backend/hung.test.mts'))
    const script = `${definitions}\nstart_deadline_dump\nwait`

    const fired = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        VITEST_FILE_PROGRESS_FILE: progress,
        DEADLINE_DUMP_AFTER_SECONDS: '0',
      },
    })
    expect(fired.stdout).toContain('[backend-unit-deadline] unfinished backend/hung.test.mts')
    expect(fired.stdout).toContain('[backend-unit-deadline] ps ')

    // Output goes to a file, not a pipe: a sleep leaked by an early stop would inherit the pipe and
    // hang the spawn until its delay elapsed (the merge-queue tooling hang).
    const out = path.join(dir, 'early.log')
    const outFd = openSync(out, 'w')
    const early = spawnSync(
      'bash',
      [
        '-c',
        `${definitions}\nstart_deadline_dump\nstop_samplers() { kill $sampler_pids; }\nstop_samplers; wait`,
      ],
      {
        stdio: ['ignore', outFd, 'ignore'],
        env: {
          ...process.env,
          VITEST_FILE_PROGRESS_FILE: progress,
          DEADLINE_DUMP_AFTER_SECONDS: '600',
        },
      },
    )
    closeSync(outFd)
    expect(early.status).toBe(0)
    expect(readFileSync(out, 'utf8')).toBe('')
  })

  it.each([
    ['before the sleep starts', ':', 'sh -c "kill -TERM \\$PPID"'],
    [
      'between the sleep fork and its pid assignment',
      // The DEBUG hook delivers TERM right before `sleep_pid=$!`, where a handler cannot yet know
      // which sleep to stop.
      `set -T; trap 'if [ "$BASH_COMMAND" = "sleep_pid=\\$!" ]; then echo "$!"; sh -c "kill -TERM \\$PPID"; fi' DEBUG`,
      ':',
    ],
  ])('stops without leaking its sleep when stopped %s', async (_label, hook, stopNow) => {
    const run = steps.find(candidate => candidate.name === 'Run backend tests') as
      | { run?: string }
      | undefined
    const definitions = (run?.run ?? '').split('trap stop_samplers EXIT')[0]
    const handler = /trap '(stopped=1;[^'\n]+)' TERM INT/u.exec(definitions ?? '')?.[1]
    expect(handler).toBeDefined()
    // A leaked sleep keeps stdout open, so `close` never fires and the test times out instead.
    const script = `${definitions}
( stopped=; sleep_pid=; trap '${handler}' TERM INT; ${hook}
  ${stopNow}
  sleep_unless_stopped 6001; echo "returned=$?" )`
    const child = spawn('bash', ['-c', script], { stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    child.stdout.on('data', chunk => {
      output += String(chunk)
      for (const line of output.split('\n')) {
        if (/^\d+$/u.test(line)) sleepPids.push(Number(line))
      }
    })
    await new Promise(resolve => child.once('close', resolve))
    expect(output).toContain('returned=1')
  })

  it('uploads the progress file even when the test step is killed', () => {
    const upload = steps.find(candidate => candidate.name?.includes('file progress'))
    expect(upload?.if).toBe('always()')
  })
})
