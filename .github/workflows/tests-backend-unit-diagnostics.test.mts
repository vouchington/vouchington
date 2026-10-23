import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { formatFileProgress } from 'vouchington-tooling/vitest-diagnostics'

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
    writeFileSync(
      progress,
      formatFileProgress(
        'start',
        'backend/hung.test.mts',
        undefined,
        undefined,
        '[backend-unit-file]',
      ),
    )
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

    const early = spawnSync(
      'bash',
      ['-c', `${definitions}\nstart_deadline_dump\nstop_samplers; wait`],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          VITEST_FILE_PROGRESS_FILE: progress,
          DEADLINE_DUMP_AFTER_SECONDS: '600',
        },
      },
    )
    expect(early.stdout).toBe('')
  })

  it('reaps the deadline sleep if interrupted before its PID is recorded', () => {
    const runScript = steps.find(candidate => candidate.name === 'Run backend tests') as
      | { run?: string }
      | undefined
    const definitions = (runScript?.run ?? '').split('trap stop_samplers EXIT')[0]
    const racePoint = 'sleep "$DEADLINE_DUMP_AFTER_SECONDS" &\n    sleep_pid=$!'
    expect(definitions).toContain(racePoint)
    const interrupted = definitions.replace(
      racePoint,
      'sleep "$DEADLINE_DUMP_AFTER_SECONDS" &\n    printf "%s\\n" "$!" > "$SLEEP_PID_FILE"\n    sh -c \'kill -TERM "$PPID"\'\n    sleep_pid=$!',
    )
    const dir = mkdtempSync(path.join(tmpdir(), 'deadline-race-'))
    const sleepPidFile = path.join(dir, 'sleep.pid')
    try {
      const result = spawnSync(
        'bash',
        [
          '-c',
          `${interrupted}\nstart_deadline_dump\nwait\nif kill -0 "$(cat "$SLEEP_PID_FILE")" 2>/dev/null; then exit 1; fi`,
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            DEADLINE_DUMP_AFTER_SECONDS: '600',
            SLEEP_PID_FILE: sleepPidFile,
            VITEST_FILE_PROGRESS_FILE: path.join(dir, 'progress.log'),
          },
        },
      )
      expect(result.status).toBe(0)
      expect(result.stdout).toBe('')
      expect(result.stderr).toBe('')
      const sleepPid = Number(readFileSync(sleepPidFile, 'utf8').trim())
      expect(Number.isSafeInteger(sleepPid)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uploads the progress file even when the test step is killed', () => {
    const upload = steps.find(candidate => candidate.name?.includes('file progress'))
    expect(upload?.if).toBe('always()')
  })
})
