import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { envWithoutWorktreeResources, loadCurrentWorktreeEnv } from '../coverage-suites-local.mts'

const tmpDirs: string[] = []

async function makeTmpDir() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-coverage-bash-env-'))
  tmpDirs.push(dir)
  return dir
}

describe('isolated tooling env Bash startup isolation', () => {
  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('overwrites inherited BASH_ENV so child bash does not source a host startup file', async () => {
    const tmpDir = await makeTmpDir()
    const rcPath = join(tmpDir, 'startup.bash')
    await writeFile(
      rcPath,
      ['export ISOLATED_ENV_BASH_STARTUP_SENTINEL=leaked', 'echo BASH_ENV_STARTUP_SENTINEL'].join(
        '\n',
      ),
    )

    const path = process.env.PATH ?? '/usr/bin:/bin'
    const isolatedEnv = envWithoutWorktreeResources({
      BASH_ENV: rcPath,
      KEEP_ME: 'yes',
      PATH: path,
    })

    expect(isolatedEnv).toEqual({
      BASH_ENV: '/dev/null',
      KEEP_ME: 'yes',
      PATH: path,
    })

    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-euo', 'pipefail', '-c', 'printf ok'],
      {
        encoding: 'utf8',
        env: isolatedEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('ok')
    expect(result.stderr).not.toMatch(/BASH_ENV_STARTUP_SENTINEL|HOME: unbound|parameter null/)
  })

  it('does not let loadCurrentWorktreeEnv inherit a host BASH_ENV startup file', async () => {
    const tmpDir = await makeTmpDir()
    const rcPath = join(tmpDir, 'startup.bash')
    await writeFile(rcPath, 'export ISOLATED_ENV_BASH_STARTUP_SENTINEL=leaked\n')
    await writeFile(
      join(tmpDir, '.env'),
      'export DATABASE_URL=postgres://localhost/voucha-coverage-test\n',
    )

    const env = loadCurrentWorktreeEnv(tmpDir, {
      BASH_ENV: rcPath,
      PATH: process.env.PATH ?? '/usr/bin:/bin',
    })

    expect(env.DATABASE_URL).toBe('postgres://localhost/voucha-coverage-test')
    expect(env.ISOLATED_ENV_BASH_STARTUP_SENTINEL).toBeUndefined()
    expect(env.BASH_ENV).toBe('/dev/null')
  })
})
