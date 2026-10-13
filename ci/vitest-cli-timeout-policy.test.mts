import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let fixture: string

function run(command: string, args: string[], group = false) {
  const result = spawnSync(
    group ? process.execPath : './ci/with-node-test-options',
    group ? ['ci/run-vitest-project-group.mts', 'backend-modules', ...args] : [command, ...args],
    {
      encoding: 'utf8',
      timeout: 2000,
      env: {
        ...process.env,
        PATH: `${fixture}:${process.env.PATH}`,
        NODE_OPTIONS: '--enable-source-maps',
      },
    },
  )
  expect(result.error).toBeUndefined()
  return result
}

describe('Vitest CLI command boundary', () => {
  beforeEach(() => {
    fixture = mkdtempSync(join(tmpdir(), 'vitest-cli-boundary-'))
    const recorder = `#!/bin/sh\nexec node -e 'console.log(JSON.stringify({args:process.argv.slice(1),options:process.env.NODE_OPTIONS}))' -- "$@"\n`
    for (const name of ['vitest', 'ordinary']) {
      writeFileSync(join(fixture, name), recorder, { mode: 0o755 })
    }
  })
  afterEach(() => rmSync(fixture, { recursive: true, force: true }))

  it.each(['0', '-1', '30001', 'Infinity', 'NaN', '', 'true'])(
    'rejects invalid timeout %s before the child runs',
    value => {
      const result = run('vitest', ['run', `--testTimeout=${value}`])
      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('finite positive timeout')
    },
  )

  it('rejects missing and negated hook values before the child runs', () => {
    for (const args of [['--hookTimeout'], ['--no-hookTimeout'], ['--no-hook-timeout']]) {
      const result = run('vitest', ['run', ...args])
      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
    }
  })

  it.each(['testTimeout', 'hookTimeout', 'test-timeout', 'hook-timeout'])(
    'admits both numeric forms for %s and preserves argv',
    option => {
      for (const timeoutArgs of [[`--${option}=30000`], [`--${option}`, '0.5']]) {
        const args = ['run', ...timeoutArgs, '--reporter', 'json', 'tiny.test.mts']
        const result = run(join(fixture, 'vitest'), args)
        expect(result.status).toBe(0)
        expect(JSON.parse(result.stdout)).toEqual({
          args,
          options: '--enable-source-maps --disable-warning=DEP0205',
        })
      }
    },
  )

  it('validates a Node-launched Vitest executable before it can run', () => {
    const executable = join(fixture, 'vitest.mjs')
    writeFileSync(executable, 'console.log(JSON.stringify(process.argv.slice(2)))')
    const rejected = run(process.execPath, [executable, '--hook-timeout=30001'])
    expect(rejected.status).toBe(1)
    expect(rejected.stdout).toBe('')
    const args = ['run', '--test-timeout', '30000', '--hookTimeout=1']
    const admitted = run(process.execPath, [executable, ...args])
    expect(admitted.status).toBe(0)
    expect(JSON.parse(admitted.stdout)).toEqual(args)
  })

  it('preserves positional arguments after the CLI separator', () => {
    const args = ['run', '--', '--testTimeout=0', 'a path.test.mts']
    const result = run('vitest', args)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).args).toEqual(args)
  })

  it('preserves unrelated commands and their timeout-like arguments', () => {
    const args = ['--testTimeout=0', '--hookTimeout', 'Infinity', 'a path']
    const result = run(join(fixture, 'ordinary'), args)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).args).toEqual(args)
    const node = run(process.execPath, [
      '-e',
      'console.log(process.argv[1])',
      '--',
      '--testTimeout=0',
    ])
    expect(node.status).toBe(0)
    expect(node.stdout.trim()).toBe('--testTimeout=0')
  })

  it('validates group arguments before spawning and forwards admitted values intact', () => {
    const rejected = run('vitest', ['--', '--hook-timeout', '30001'], true)
    expect(rejected.status).toBe(1)
    expect(rejected.stdout).toBe('')
    const args = ['--testTimeout=30000', '--hook-timeout', '1', '--reporter=json', 'tiny.test.mts']
    const admitted = run('vitest', ['--', ...args], true)
    expect(admitted.status).toBe(0)
    expect(JSON.parse(admitted.stdout).args).toEqual([
      'run',
      '--project',
      'backend/data-stores/analytics',
      '--project',
      'backend/services/analytics',
      '--project',
      'backend-modules',
      '--project',
      'backend-no-data-mocks',
      '--project',
      'backend-test-helpers',
      '--project',
      'backend-email-templates',
      ...args,
    ])
  })
})
