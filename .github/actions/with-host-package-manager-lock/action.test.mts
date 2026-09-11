import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type CompositeAction = {
  inputs?: Record<string, { default?: string; required?: boolean }>
  runs?: {
    using?: string
    steps?: Array<{
      env?: Record<string, string>
      run?: string
      shell?: string
    }>
  }
}

const actionText = readFileSync('.github/actions/with-host-package-manager-lock/action.yml', 'utf8')
const action = load(actionText) as CompositeAction
const lockStep = action.runs?.steps?.[0]
const lockStepRun = lockStep?.run ?? ''

describe('with-host-package-manager-lock action', () => {
  it('exposes the locked command, working directory, and timeout inputs', () => {
    expect(action.runs?.using).toBe('composite')
    expect(action.inputs?.command?.required).toBe(true)
    expect(action.inputs?.['working-directory']?.default).toBe('.')
    expect(action.inputs?.['timeout-seconds']?.default).toBe('300')

    expect(lockStep?.shell).toBe('bash')
    expect(lockStep?.env?.LOCKED_COMMAND).toBe('${{ inputs.command }}')
    expect(lockStep?.env?.HOST_LOCK_TIMEOUT_SECONDS).toBe('${{ inputs.timeout-seconds }}')
  })

  it('delegates shared locking to the generic host-lock helper', () => {
    expect(lockStepRun).toContain('$GITHUB_WORKSPACE/ci/with-host-lock.sh')
    expect(lockStepRun).toContain('--name host-package-manager')
    expect(lockStepRun).toContain('--timeout-seconds "$HOST_LOCK_TIMEOUT_SECONDS"')
    expect(lockStepRun).not.toContain('lock_dir=')
    expect(lockStepRun).not.toContain('mkdir "$lock_dir"')
  })

  it('runs the caller command while the cleanup trap owns the lock', () => {
    expect(actionText).not.toContain('eval')
    expect(lockStepRun.indexOf('with-host-lock.sh')).toBeLessThan(
      lockStepRun.indexOf('source "$1"'),
    )
    expect(lockStepRun).toContain(
      'command_file="$(mktemp "${RUNNER_TEMP:-/tmp}/host-package-manager-lock-command-XXXXXX")"',
    )
    expect(lockStepRun).not.toContain('host-package-manager-lock-command-$$.sh')
    expect(lockStepRun).toContain('printf \'%s\\n\' "$LOCKED_COMMAND" > "$command_file"')
    expect(lockStepRun).toContain('-- bash -euo pipefail -c \'source "$1"\'')
    expect(lockStepRun).toContain('with-host-package-manager-lock "$command_file"')
  })

  it('executes a multiline caller command from the selected working directory', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'host-package-manager-action-'))
    const home = join(tempRoot, 'home')
    const workingDirectory = join(tempRoot, 'working-directory')
    mkdirSync(home)
    mkdirSync(workingDirectory)

    try {
      const result = spawnSync('bash', ['-c', lockStepRun], {
        cwd: workingDirectory,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_WORKSPACE: process.cwd(),
          HOME: home,
          HOST_LOCK_TIMEOUT_SECONDS: '5',
          LOCKED_COMMAND: "printf '%s\\n' first > result.txt\nprintf '%s\\n' second >> result.txt",
          RUNNER_TEMP: tempRoot,
          VOUCHA_HOST_LOCK_ROOT: join(tempRoot, 'locks'),
        },
      })

      expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 })
      expect(readFileSync(join(workingDirectory, 'result.txt'), 'utf8')).toBe('first\nsecond\n')
    } finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  it('fails fast when an early caller command fails', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'host-package-manager-action-strict-'))
    const home = join(tempRoot, 'home')
    mkdirSync(home)

    try {
      const result = spawnSync('bash', ['-c', lockStepRun], {
        cwd: tempRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_WORKSPACE: process.cwd(),
          HOME: home,
          HOST_LOCK_TIMEOUT_SECONDS: '5',
          LOCKED_COMMAND: 'false\ntouch must-not-exist',
          RUNNER_TEMP: tempRoot,
          VOUCHA_HOST_LOCK_ROOT: join(tempRoot, 'locks'),
        },
      })

      expect(result.status).not.toBe(0)
      expect(existsSync(join(tempRoot, 'must-not-exist'))).toBe(false)
    } finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })
})
