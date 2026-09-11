import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { initializeBashArgs } from '../test-helpers/initialize.mts'

const execFileAsync = promisify(execFile)

const testDirs: string[] = []

async function makeWorktreeDir(...parts: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-'))
  const dir = join(root, ...parts)
  await mkdir(dir, { recursive: true })
  testDirs.push(root)
  return dir
}

async function runRetryScript({
  cwd,
  script,
}: {
  cwd: string
  script: string
}): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  try {
    const result = await execFileAsync('bash', initializeBashArgs(script), {
      cwd,
      env: {
        ...process.env,
        HOME: dirname(cwd),
      },
    })

    return { exitCode: 0, stderr: result.stderr.trim(), stdout: result.stdout.trim() }
  } catch (err: unknown) {
    const e = err as { code?: number; stderr?: string; stdout?: string }
    return {
      exitCode: typeof e.code === 'number' ? e.code : 1,
      stderr: (e.stderr ?? '').trim(),
      stdout: (e.stdout ?? '').trim(),
    }
  }
}

describe('initialize retry helpers', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('retries a transient command failure until it succeeds', async () => {
    const cwd = await makeWorktreeDir('feature-retry-success')

    const result = await runRetryScript({
      cwd,
      script: `
        attempts=0
        sleep() { :; }
        flaky_command() {
          attempts=$((attempts + 1))
          [ "$attempts" -ge 3 ]
        }
        retry_command 3 0 "flaky command" flaky_command
        printf 'attempts=%s\\n' "$attempts"
      `,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('attempt 1 failed for flaky command')
    expect(result.stdout).toContain('attempt 2 failed for flaky command')
    expect(result.stdout).toContain('attempts=3')
  })

  it('returns the final command status after exhausting retries', async () => {
    const cwd = await makeWorktreeDir('feature-retry-failure')

    const result = await runRetryScript({
      cwd,
      script: `
        attempts=0
        sleep() { :; }
        always_fails() {
          attempts=$((attempts + 1))
          return 7
        }
        set +e
        retry_command 2 0 "always fails" always_fails
        status=$?
        set -e
        printf 'status=%s attempts=%s\\n' "$status" "$attempts"
      `,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('attempt 1 failed for always fails')
    expect(result.stdout).toContain('status=7 attempts=2')
  })
})
