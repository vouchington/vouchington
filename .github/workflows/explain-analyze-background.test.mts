import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = '.github/workflows/explain-analyze-background.sh'

let runnerTemp = ''

function run(...args: string[]) {
  return spawnSync('bash', [SCRIPT, ...args], {
    env: { ...process.env, RUNNER_TEMP: runnerTemp },
    encoding: 'utf8',
  })
}

describe('explain-analyze background steps', () => {
  beforeEach(() => {
    runnerTemp = mkdtempSync(join(tmpdir(), 'explain-background-'))
  })
  afterEach(() => {
    rmSync(runnerTemp, { recursive: true, force: true })
  })

  it('returns from begin at once and lets finish wait for the command and print its output', () => {
    const begin = run('begin', 'slow', 'bash', '-c', 'sleep 1; echo finished-after-begin')
    expect(begin.status).toBe(0)
    expect(begin.stdout).not.toContain('finished-after-begin')
    const finish = run('finish', 'slow')
    expect({ status: finish.status, stdout: finish.stdout }).toEqual({
      status: 0,
      stdout: 'finished-after-begin\n',
    })
  })

  it('fails finish when the command failed and still prints what it wrote', () => {
    run('begin', 'broken', 'bash', '-c', 'echo reason; exit 3')
    const finish = run('finish', 'broken')
    expect(finish.status).toBe(1)
    expect(finish.stdout).toContain('reason')
    expect(finish.stdout).toContain('Background command broken failed')
  })

  it('fails finish for a command that was never started', () => {
    const finish = run('finish', 'missing')
    expect(finish.status).toBe(1)
    expect(finish.stdout).toContain('Background command missing was never started')
  })

  it('rejects a call without a name', () => {
    expect(run('begin').status).toBe(2)
  })
})

type Step = { name?: string; uses?: string; run?: string }
type Workflow = { jobs: Record<string, { steps: Step[] }> }

describe('explain-analyze overlapped setup', () => {
  const workflow = parse(readFileSync('.github/workflows/explain-analyze.yml', 'utf8')) as Workflow
  const position = (job: string, match: (step: Step) => boolean) =>
    workflow.jobs[job]!.steps.findIndex(match)

  it.each([
    ['seed-explain', 'background.sh begin restore', 'background.sh finish restore'],
    ['explain-analyze', 'background.sh begin postgres', 'background.sh finish postgres'],
  ])(
    '%s starts its background command before Node setup and waits after it',
    (job, begin, finish) => {
      const started = position(job, step => step.run?.includes(begin) === true)
      const setup = position(job, step => step.uses === './.github/actions/setup-backend')
      const waited = position(job, step => step.run?.includes(finish) === true)
      expect(started).toBeGreaterThan(-1)
      expect(setup).toBeGreaterThan(started)
      expect(waited).toBeGreaterThan(setup)
    },
  )
})
