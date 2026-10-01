import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Step = { name?: string; run?: string; uses?: string; 'timeout-minutes'?: number }

const actionSource = readFileSync('.github/actions/setup-playwright/action.yml', 'utf8')
const action = parse(actionSource) as { runs: { steps: Step[] } }
const probeScript = 'ci/playwright/chromium-launch-probe.mts'
function stepScript(name: string): string {
  const run = action.runs.steps.find(step => step.name === name)?.run
  if (!run) throw new Error(`setup-playwright has no run step named "${name}"`)
  return run
}

// Runs a step's real script under the shell GitHub uses, with `node`, `pnpm` and `python3` replaced
// by fakes that log their arguments and exit with the next queued status (0 once the queue is
// empty). Nothing downloads, installs, or touches apt.
function runStep(name: string, statuses: { node?: number[]; python3?: number[] } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'setup-playwright-'))
  const bin = join(directory, 'bin')
  const workspace = join(directory, 'workspace')
  const log = join(directory, 'log')
  mkdirSync(bin)
  mkdirSync(join(workspace, 'ci'), { recursive: true })
  writeFileSync(log, '')
  const fake = (command: string, queue: number[] = []) => {
    writeFileSync(join(directory, `${command}.queue`), `${queue.map(String).join('\n')}\n`)
    writeFileSync(
      join(bin, command),
      `#!/bin/bash
printf '%s\\n' "${command} $*" >> "$FAKE_LOG"
queue="${join(directory, `${command}.queue`)}"
next="$(head -n 1 "$queue")"
tail -n +2 "$queue" > "$queue.rest" && mv "$queue.rest" "$queue"
exit "\${next:-0}"
`,
    )
    chmodSync(join(bin, command), 0o755)
  }
  fake('node', statuses.node)
  fake('python3', statuses.python3)
  fake('pnpm')
  writeFileSync(
    join(workspace, 'ci/wait-for-apt-locks.sh'),
    '#!/bin/bash\nprintf "wait-for-apt-locks\\n" >> "$FAKE_LOG"\n',
  )
  try {
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-eo', 'pipefail', '-c', stepScript(name)],
      {
        encoding: 'utf8',
        env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_WORKSPACE: workspace, FAKE_LOG: log },
      },
    )
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean)
    return { status: result.status, calls: calls.map(call => call.replaceAll(workspace, '$WS')) }
  } finally {
    rmSync(directory, { recursive: true })
  }
}

describe('setup-playwright browser download', () => {
  it('downloads Chromium under a 2-minute bound and never installs host packages', () => {
    const { status, calls } = runStep('Install Playwright browsers')

    expect(status).toBe(0)
    expect(calls).toEqual([
      'python3 $WS/ci/run-bounded.py 120 pnpm exec playwright install chromium',
    ])
  })

  it('retries one stalled download once', () => {
    const { status, calls } = runStep('Install Playwright browsers', { python3: [124, 0] })

    expect(status).toBe(0)
    expect(calls).toHaveLength(2)
  })

  it('fails with the final status after the second stalled download', () => {
    const { status, calls } = runStep('Install Playwright browsers', { python3: [124, 124] })

    expect(status).toBe(124)
    expect(calls).toHaveLength(2)
  })
})

describe('setup-playwright Chromium launch check', () => {
  const probe = `node $WS/${probeScript}`

  it('uses no apt when Chromium launches', () => {
    const { status, calls } = runStep('Verify Chromium launches', { node: [0] })

    expect(status).toBe(0)
    expect(calls).toEqual([probe])
  })

  it('installs host packages, then probes again, when Chromium cannot launch', () => {
    const { status, calls } = runStep('Verify Chromium launches', { node: [1, 0] })

    expect(status).toBe(0)
    expect(calls).toEqual([
      probe,
      'wait-for-apt-locks',
      'pnpm exec playwright install-deps chromium',
      probe,
    ])
  })

  it('fails without retrying when Chromium still cannot launch after the host packages', () => {
    const { status, calls } = runStep('Verify Chromium launches', { node: [1, 1] })

    expect(status).not.toBe(0)
    expect(calls.filter(call => call.includes('install-deps'))).toHaveLength(1)
    expect(calls.filter(call => call === probe)).toHaveLength(2)
  })

  it('keeps the apt fallback out of run-bounded, which cannot kill sudo-owned apt', () => {
    const { calls } = runStep('Verify Chromium launches', { node: [1, 0] })

    expect(calls.some(call => call.startsWith('python3'))).toBe(false)
  })

  it('probes with a script that exists in the repository', () => {
    expect(existsSync(probeScript)).toBe(true)
  })
})

describe('setup-playwright callers', () => {
  // The apt fallback is bounded by the caller's step timeout alone.
  it('give every setup-playwright step a timeout', () => {
    const workflowDirectory = '.github/workflows'
    const callers = readdirSync(workflowDirectory)
      .filter(file => file.endsWith('.yml'))
      .flatMap(file => {
        const workflow = parse(readFileSync(join(workflowDirectory, file), 'utf8')) as {
          jobs?: Record<string, { steps?: Step[] }>
        }
        return Object.values(workflow.jobs ?? {})
          .flatMap(job => job.steps ?? [])
          .filter(step => step.uses === './.github/actions/setup-playwright')
          .map(step => ({ file, timeout: step['timeout-minutes'] }))
      })

    expect(callers.length).toBeGreaterThan(0)
    expect(callers.filter(({ timeout }) => typeof timeout !== 'number')).toEqual([])
  })
})

describe('setup-playwright removed paths', () => {
  // The shared host lock and the Ubicloud ARM64 curl/unzip branch were removed once GitHub-hosted
  // runners stopped sharing a host across concurrent jobs (each job gets its own single-use VM).
  it('keeps the host lock and the Ubicloud branch removed', () => {
    expect(actionSource).not.toContain('with-host-lock.sh')
    expect(actionSource).not.toContain('host_lock_timeout_seconds')
    expect(actionSource).not.toContain('ubicloud')
  })
})
