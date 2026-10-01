import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

type Step = { name?: string; run?: string; uses?: string; 'timeout-minutes'?: number }

const depsStep = 'Install Playwright system dependencies'
const browserStep = 'Install Playwright browsers'
const dryRun = 'exec playwright install-deps --dry-run chromium'
const repair = 'exec playwright install-deps chromium'
const fontsOnly = 'Missing system dependencies (3):\n  fonts-unifont\n  xfonts-utils\n  xfonts-base'
const withLibrary = `${fontsOnly}\n  libnss3`
const action = parse(readFileSync('.github/actions/setup-playwright/action.yml', 'utf8')) as {
  runs: { steps: Step[] }
}

function stepScript(name: string): string {
  const script = action.runs.steps.find(step => step.name === name)?.run
  if (!script) throw new Error(`setup-playwright has no run step named ${name}`)
  return script
}

// A stub `pnpm` that logs every call. Dry-run probe N prints `probe-N` (or `probe-last`) and exits
// with `probe-N.status`; browser download N exits with the status in `install-N` (default 0).
const pnpmStub = `#!/usr/bin/env bash
echo "$*" >> "$STATE/calls"
bump() { n=$(( $(cat "$STATE/$1" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STATE/$1"; }
case "$*" in
  "${dryRun}")
    bump dry; f="$STATE/probe-$n"; [ -f "$f" ] || f="$STATE/probe-last"
    cat "$f"; exit "$(cat "$f.status")" ;;
  "exec playwright install chromium")
    bump install; f="$STATE/install-$n"; [ -f "$f" ] && exit "$(cat "$f")"; exit 0 ;;
esac
`

describe('setup-playwright action', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'setup-playwright-'))
    for (const sub of ['bin', 'ci', 'state']) mkdirSync(join(dir, sub))
    writeFileSync(join(dir, 'bin/pnpm'), pnpmStub)
    chmodSync(join(dir, 'bin/pnpm'), 0o755)
    writeFileSync(
      join(dir, 'ci/wait-for-apt-locks.sh'),
      '#!/usr/bin/env bash\necho wait >> "$STATE/calls"\n',
    )
    copyFileSync('ci/run-bounded.py', join(dir, 'ci/run-bounded.py'))
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function probe(n: number | 'last', report: string, status: number) {
    writeFileSync(join(dir, `state/probe-${n}`), `${report}\n`)
    writeFileSync(join(dir, `state/probe-${n}.status`), String(status))
  }

  function run(stepName: string) {
    const result = spawnSync('bash', ['-c', stepScript(stepName)], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_WORKSPACE: dir,
        PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
        STATE: join(dir, 'state'),
      },
    })
    const calls = readFileSync(join(dir, 'state/calls'), 'utf8').trim().split('\n')
    return { ...result, calls: calls.map(call => (call === dryRun ? 'dry-run' : call)) }
  }

  describe('system dependencies', () => {
    it('does nothing when every dependency is installed', () => {
      probe('last', 'All system dependencies are installed.', 0)
      const result = run(depsStep)

      expect(result.status).toBe(0)
      expect(result.calls).toEqual(['dry-run'])
    })

    it('does not run apt for a font-only gap, and still prints what is missing', () => {
      probe('last', fontsOnly, 1)
      const result = run(depsStep)

      expect(result.status).toBe(0)
      expect(result.calls).toEqual(['dry-run'])
      expect(result.stderr).toContain('fonts-unifont')
    })

    it('repairs a missing library only after waiting for external apt/dpkg holders', () => {
      probe('last', withLibrary, 1)
      const result = run(depsStep)

      expect(result.status).toBe(0)
      expect(result.calls).toEqual(['dry-run', 'wait', 'dry-run', repair])
    })

    it('skips the repair when the lock holder installed the library first', () => {
      probe(1, withLibrary, 1)
      probe('last', fontsOnly, 1)
      const result = run(depsStep)

      expect(result.status).toBe(0)
      expect(result.calls).toEqual(['dry-run', 'wait', 'dry-run'])
    })

    it('repairs when the dry-run output is not recognisable', () => {
      probe('last', "Error: 'apt-get install -s' exited with code 100:\n  E: unable to locate", 1)

      expect(run(depsStep).calls.at(-1)).toBe(repair)
    })

    it('runs outside any deadline wrapper because root-owned apt cannot be killed by one', () => {
      // run-bounded.py signals the runner user's process group; Playwright runs apt through sudo.
      expect(stepScript(depsStep)).not.toContain('run-bounded')
    })
  })

  describe('browser download', () => {
    it('retries a failed attempt once', () => {
      writeFileSync(join(dir, 'state/install-1'), '1')
      const result = run(browserStep)

      expect(result.status).toBe(0)
      expect(result.calls).toEqual(Array(2).fill('exec playwright install chromium'))
      expect(result.stdout).toContain('::warning::Playwright browser install attempt 1 failed')
    })

    it('fails with the last status after two attempts', () => {
      writeFileSync(join(dir, 'state/install-1'), '3')
      writeFileSync(join(dir, 'state/install-2'), '3')
      const result = run(browserStep)

      expect(result.status).toBe(3)
      expect(result.stdout).toContain(
        '::error::Playwright browser install failed after 2 attempts (status 3)',
      )
    })

    it('bounds only the browser download, never system packages', () => {
      const script = stepScript(browserStep)

      expect(script).toContain('run-bounded.py" 120 pnpm exec playwright install chromium')
      expect(script).not.toMatch(/install-deps|apt/)
    })
  })

  describe('callers', () => {
    it('give every call a step timeout, the backstop for the unwrapped apt repair', () => {
      const callers = readdirSync('.github/workflows')
        .filter(file => file.endsWith('.yml'))
        .flatMap(file => {
          const workflow = parse(readFileSync(join('.github/workflows', file), 'utf8')) as {
            jobs?: Record<string, { steps?: Step[] }>
          }
          return Object.values(workflow.jobs ?? {})
            .flatMap(job => job.steps ?? [])
            .filter(step => step.uses === './.github/actions/setup-playwright')
            .map(step => step['timeout-minutes'])
        })

      expect(callers.length).toBeGreaterThanOrEqual(3)
      expect(callers.every(timeout => typeof timeout === 'number')).toBe(true)
    })
  })
})
