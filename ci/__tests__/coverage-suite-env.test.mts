import { rmSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LIBPQ_RESOURCE_ENV_NAMES } from '../db-env-names.mts'
import {
  DB_ENV_NAMES,
  envForDbBackedToolingProject,
  envForCoverageRun,
  envForDbBackedSuite,
  loadCurrentWorktreeEnv,
  SUITES,
  WORKTREE_RESOURCE_ENV_NAMES,
  envWithoutWorktreeResources,
} from '../coverage-suites-local.mts'

const tmpDirs: string[] = []

async function makeTmpDir() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-coverage-test-'))
  tmpDirs.push(dir)
  return dir
}

describe('envForDbBackedSuite', () => {
  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('loads and validates the current worktree .env for DB-backed coverage', async () => {
    const tmpDir = await makeTmpDir()
    const worktreeDir = basename(tmpDir)
    await writeFile(join(tmpDir, '.initialized'), 'web')
    await writeFile(
      join(tmpDir, '.env'),
      [
        `export WORKTREE_DIR=${worktreeDir}`,
        'export DATABASE_URL=postgres://localhost/voucha-coverage-test',
        'export VALKEY_URL=redis://localhost:6379',
      ].join('\n'),
    )

    const env = envForDbBackedSuite(tmpDir, {
      DATABASE_URL: 'postgres://localhost/voucha',
    })

    expect(env.WORKTREE_DIR).toBe(worktreeDir)
    expect(env.DATABASE_URL).toBe('postgres://localhost/voucha-coverage-test')
    expect(env.VALKEY_URL).toBe('redis://localhost:6379')
  })

  it('applies the current worktree environment over inherited resource values', async () => {
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
    const targetEnv: NodeJS.ProcessEnv = {
      DATABASE_URL: 'postgres://localhost/voucha',
      NODE_ENV: 'test',
      PGHOST: 'stale-host',
      VALKEY_CONTAINER: 'stale-valkey',
      WORKTREE_DIR: 'stale-worktree',
    }

    const env = envForDbBackedToolingProject(tmpDir, targetEnv)

    expect(env.DATABASE_URL).toBe('postgres://localhost/voucha-tooling-test')
    expect(env.VALKEY_URL).toBe('redis://localhost:6379')
    expect(env.PORT).toBe('4100')
    expect(env.WORKTREE_DIR).toBe(worktreeDir)
    expect(env.NODE_ENV).toBe('test')
    expect(env.PGHOST).toBeUndefined()
    expect(env.VALKEY_CONTAINER).toBeUndefined()
  })

  it('does not tell tooling callers to source an environment it loads automatically', async () => {
    const tmpDir = await makeTmpDir()

    expect(() => envForDbBackedToolingProject(tmpDir, {})).toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          'Run ./dev/initialize backend (or web) before rerunning tooling tests.',
        ),
      }),
    )
    expect(() => envForDbBackedToolingProject(tmpDir, {})).toThrow(
      expect.not.objectContaining({
        message: expect.stringContaining('source .env'),
      }),
    )
  })

  it('clears every DB, PostgreSQL, Valkey, and worktree resource variable', () => {
    expect(LIBPQ_RESOURCE_ENV_NAMES).toEqual(
      new Set([
        'PGAPPNAME',
        'PGCONNECT_TIMEOUT',
        'PGDATABASE',
        'PGHOST',
        'PGHOSTADDR',
        'PGOPTIONS',
        'PGPASSWORD',
        'PGPORT',
        'PGSERVICE',
        'PGSERVICEFILE',
        'PGSSLCRL',
        'PGSSLCRLDIR',
        'PGSSLCERT',
        'PGSSLKEY',
        'PGSSLMODE',
        'PGSSLROOTCERT',
        'PGTARGETSESSIONATTRS',
        'PGUSER',
      ]),
    )
    expect(WORKTREE_RESOURCE_ENV_NAMES).toEqual(
      new Set([
        ...DB_ENV_NAMES,
        'API_BASE_URL',
        'CF_WORKER_ROUTE',
        'IMAGE_LAMBDA_PORT',
        'IMAGE_ORIGIN',
        'INSPECTOR_PORT',
        'LIGHTPANDA_CDP_URL',
        'NEXT_PORT',
        'NEXT_PUBLIC_API_BASE_URL',
        'PORT',
        'SITEMAP_BASE_URL',
        'STORYBOOK_PORT',
        'VALKEY_CONTAINER',
        'WEB_PORT',
        'WORKER_PORT',
        'WORKTREE_DIR',
      ]),
    )
    const env = Object.fromEntries(
      [...WORKTREE_RESOURCE_ENV_NAMES].map(name => [name, `ambient-${name}`]),
    )
    env.KEEP_ME = 'yes'

    const isolatedEnv = envWithoutWorktreeResources(env)

    expect(isolatedEnv).toEqual({ BASH_ENV: '/dev/null', KEEP_ME: 'yes' })
  })

  it('loads the current worktree .env for the Playwright helper suite', async () => {
    const tmpDir = await makeTmpDir()
    const worktreeDir = basename(tmpDir)
    await writeFile(join(tmpDir, '.initialized'), 'web')
    await writeFile(
      join(tmpDir, '.env'),
      [
        `export WORKTREE_DIR=${worktreeDir}`,
        'export DATABASE_URL=postgres://localhost/voucha-playwright-helper-test',
        'export VALKEY_URL=redis://localhost:6379',
      ].join('\n'),
    )
    const suite = SUITES.find(candidate => candidate.name === 'playwright-helpers')

    if (!suite) throw new Error('playwright-helpers suite is missing')
    const env = envForCoverageRun({ ...suite, serialExecution: true }, tmpDir, {})

    expect(env.DATABASE_URL).toBe('postgres://localhost/voucha-playwright-helper-test')
    expect(env.VALKEY_URL).toBe('redis://localhost:6379')
    expect(env.VITEST_COVERAGE_SCOPE).toBe('tooling')
    expect(env.VITEST_MAX_WORKERS).toBe('1')
  })

  it('rejects stale worktree .env before DB-backed coverage runs', async () => {
    const tmpDir = await makeTmpDir()
    await writeFile(join(tmpDir, '.initialized'), 'web')
    await writeFile(
      join(tmpDir, '.env'),
      [
        'export WORKTREE_DIR=some-other-worktree',
        'export DATABASE_URL=postgres://localhost/voucha-coverage-test',
        'export VALKEY_URL=redis://localhost:6379',
      ].join('\n'),
    )

    expect(() => envForDbBackedSuite(tmpDir, {})).toThrow('WORKTREE_DIR points at')
  })

  it('rejects stale WORKTREE_DIR even when the checkout has a main .git directory', async () => {
    const tmpDir = await makeTmpDir()
    await mkdir(join(tmpDir, '.git'))
    await writeFile(join(tmpDir, '.initialized'), 'web')
    await writeFile(
      join(tmpDir, '.env'),
      [
        'export WORKTREE_DIR=some-other-worktree',
        'export DATABASE_URL=postgres://localhost/voucha-coverage-test',
        'export VALKEY_URL=redis://localhost:6379',
      ].join('\n'),
    )

    expect(() => envForDbBackedSuite(tmpDir, {})).toThrow('WORKTREE_DIR points at')
  })

  it('requires WORKTREE_DIR even when the checkout has a main .git directory', async () => {
    const tmpDir = await makeTmpDir()
    await mkdir(join(tmpDir, '.git'))
    await writeFile(join(tmpDir, '.initialized'), 'web')
    await writeFile(
      join(tmpDir, '.env'),
      [
        'export DATABASE_URL=postgres://localhost/voucha-coverage-test',
        'export VALKEY_URL=redis://localhost:6379',
      ].join('\n'),
    )

    expect(() => envForDbBackedSuite(tmpDir, {})).toThrow('WORKTREE_DIR is not set')
  })

  it('does not fall back to regex parsing when .env fails to source', async () => {
    const tmpDir = await makeTmpDir()
    await writeFile(
      join(tmpDir, '.env'),
      [
        `export WORKTREE_DIR=${basename(tmpDir)}`,
        'return 1',
        'export DATABASE_URL=postgres://localhost/voucha-coverage-test',
        'export VALKEY_URL=redis://localhost:6379',
      ].join('\n'),
    )

    expect(() => loadCurrentWorktreeEnv(tmpDir, {})).toThrow('Command failed')
  })

  it('does not inherit DB-backed resource settings from the caller shell', async () => {
    const tmpDir = await makeTmpDir()
    await writeFile(join(tmpDir, '.initialized'), 'web')
    await writeFile(
      join(tmpDir, '.env'),
      [
        'export DATABASE_URL=postgres://localhost/voucha-coverage-test',
        'export VALKEY_URL=redis://localhost:6379',
      ].join('\n'),
    )

    expect(() =>
      envForDbBackedSuite(tmpDir, {
        WORKTREE_DIR: basename(tmpDir),
        DATABASE_URL: 'postgres://localhost/stale',
        VALKEY_CONTAINER: 'stale-valkey',
        VALKEY_URL: 'redis://localhost:1',
      }),
    ).toThrow('WORKTREE_DIR is not set')
  })

  it('does not inherit a stale Valkey container from the caller shell', async () => {
    const tmpDir = await makeTmpDir()
    await writeFile(join(tmpDir, '.env'), 'DATABASE_URL=postgres://localhost/test')

    const env = loadCurrentWorktreeEnv(tmpDir, {
      VALKEY_CONTAINER: 'stale-valkey',
    })

    expect(env.VALKEY_CONTAINER).toBeUndefined()
  })

  it('falls back to parsing simple .env files when bash is unavailable', async () => {
    const tmpDir = await makeTmpDir()
    const worktreeDir = basename(tmpDir)
    await writeFile(join(tmpDir, '.initialized'), 'web')
    await writeFile(
      join(tmpDir, '.env'),
      [
        `export WORKTREE_DIR="${worktreeDir}"`,
        'DATABASE_URL=postgres://localhost/voucha-coverage-test',
        "VALKEY_URL='redis://localhost:6379'",
      ].join('\n'),
    )

    const env = envForDbBackedSuite(tmpDir, { PATH: '/definitely-missing' })

    expect(env.WORKTREE_DIR).toBe(worktreeDir)
    expect(env.VALKEY_URL).toBe('redis://localhost:6379')
  })
})
