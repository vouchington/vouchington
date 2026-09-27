import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { LIBPQ_RESOURCE_ENV_NAMES, WORKTREE_RESOURCE_ENV_NAMES } from '../db-env-names.mts'
import {
  envForDbBackedToolingProject,
  envWithoutWorktreeResources,
  loadCurrentWorktreeEnv,
} from '../tooling-test-env.mts'

const tmpDirs: string[] = []

async function makeTmpDir() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-tooling-env-test-'))
  tmpDirs.push(dir)
  return dir
}

describe('tooling test environment', () => {
  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })

  it('loads, validates, and isolates the current worktree environment', async () => {
    const tmpDir = await makeTmpDir()
    const worktreeDir = basename(tmpDir)
    await writeFile(join(tmpDir, '.initialized'), 'web')
    await writeFile(
      join(tmpDir, '.env'),
      [
        `export WORKTREE_DIR=${worktreeDir}`,
        'export DATABASE_URL=postgres://localhost/voucha-tooling-test',
        'export VALKEY_URL=redis://localhost:6379',
        'export PORT=4100',
        'export NODE_ENV=development',
      ].join('\n'),
    )

    const env = envForDbBackedToolingProject(tmpDir, {
      DATABASE_URL: 'postgres://localhost/voucha',
      NODE_ENV: 'test',
      PGHOST: 'stale-host',
      VALKEY_CONTAINER: 'stale-valkey',
      WORKTREE_DIR: 'stale-worktree',
    })

    expect(env).toMatchObject({
      DATABASE_URL: 'postgres://localhost/voucha-tooling-test',
      NODE_ENV: 'test',
      PORT: '4100',
      VALKEY_URL: 'redis://localhost:6379',
      WORKTREE_DIR: worktreeDir,
    })
    expect(env.PGHOST).toBeUndefined()
    expect(env.VALKEY_CONTAINER).toBeUndefined()
  })

  it('keeps the initialization diagnostic specific to tooling tests', async () => {
    const tmpDir = await makeTmpDir()

    expect(() => envForDbBackedToolingProject(tmpDir, {})).toThrow(
      'Run ./dev/initialize backend (or web) before rerunning tooling tests.',
    )
  })

  it('rejects stale and missing worktree ownership', async () => {
    const tmpDir = await makeTmpDir()
    await mkdir(join(tmpDir, '.git'))
    await writeFile(join(tmpDir, '.initialized'), 'web')
    await writeFile(
      join(tmpDir, '.env'),
      'export DATABASE_URL=postgres://localhost/voucha-tooling-test\nexport VALKEY_URL=redis://localhost:6379',
    )
    expect(() => envForDbBackedToolingProject(tmpDir, {})).toThrow('WORKTREE_DIR is not set')

    await writeFile(
      join(tmpDir, '.env'),
      [
        'export WORKTREE_DIR=another-worktree',
        'export DATABASE_URL=postgres://localhost/voucha-tooling-test',
        'export VALKEY_URL=redis://localhost:6379',
      ].join('\n'),
    )
    expect(() => envForDbBackedToolingProject(tmpDir, {})).toThrow('WORKTREE_DIR points at')
  })

  it('removes every resource variable and neutralizes BASH_ENV', () => {
    const env = Object.fromEntries(
      [...WORKTREE_RESOURCE_ENV_NAMES].map(name => [name, `ambient-${name}`]),
    )
    env.BASH_ENV = '/host/startup.bash'
    env.KEEP_ME = 'yes'

    expect(envWithoutWorktreeResources(env)).toEqual({ BASH_ENV: '/dev/null', KEEP_ME: 'yes' })
    expect(LIBPQ_RESOURCE_ENV_NAMES.has('PGHOST')).toBe(true)
  })

  it('does not source the inherited Bash startup file in child processes', async () => {
    const tmpDir = await makeTmpDir()
    const rcPath = join(tmpDir, 'startup.bash')
    await writeFile(
      rcPath,
      ['export TOOLING_ENV_BASH_STARTUP_SENTINEL=leaked', 'echo startup-file-ran'].join('\n'),
    )
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-euo', 'pipefail', '-c', 'printf ok'],
      {
        encoding: 'utf8',
        env: envWithoutWorktreeResources({
          BASH_ENV: rcPath,
          PATH: process.env.PATH ?? '/usr/bin:/bin',
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('ok')
    expect(result.stderr).not.toContain('startup-file-ran')
  })

  it('does not inherit a stale Valkey container or host Bash startup file', async () => {
    const tmpDir = await makeTmpDir()
    const rcPath = join(tmpDir, 'startup.bash')
    await writeFile(rcPath, 'export TOOLING_ENV_BASH_STARTUP_SENTINEL=leaked\n')
    await writeFile(join(tmpDir, '.env'), 'DATABASE_URL=postgres://localhost/test\n')

    const env = loadCurrentWorktreeEnv(tmpDir, {
      BASH_ENV: rcPath,
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      VALKEY_CONTAINER: 'stale-valkey',
    })

    expect(env.BASH_ENV).toBe('/dev/null')
    expect(env.TOOLING_ENV_BASH_STARTUP_SENTINEL).toBeUndefined()
    expect(env.VALKEY_CONTAINER).toBeUndefined()
  })

  it('does not parse a failed shell source but falls back for a missing shell', async () => {
    const tmpDir = await makeTmpDir()
    await writeFile(join(tmpDir, '.env'), 'return 1\nDATABASE_URL=postgres://localhost/test')
    expect(() => loadCurrentWorktreeEnv(tmpDir, {})).toThrow('Command failed')

    const worktreeDir = basename(tmpDir)
    await writeFile(join(tmpDir, '.initialized'), 'web')
    await writeFile(
      join(tmpDir, '.env'),
      [
        `export WORKTREE_DIR="${worktreeDir}"`,
        'DATABASE_URL=postgres://localhost/voucha-tooling-test',
        "VALKEY_URL='redis://localhost:6379'",
      ].join('\n'),
    )
    expect(envForDbBackedToolingProject(tmpDir, { PATH: '/definitely-missing' }).VALKEY_URL).toBe(
      'redis://localhost:6379',
    )
  })
})
