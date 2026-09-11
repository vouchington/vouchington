import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  dbBackedToolingProjectNames,
  localCoverageToolingProjectNames,
} from '../../test-helpers/vitest-config/tooling-project-registry.mts'
import {
  envForSuite,
  hasWebInit,
  suiteCoverageCommand,
  SUITES,
  type Suite,
  webInitSuiteNames,
} from '../coverage-suites-local.mts'
import { LOCAL_COVERAGE_SUITES } from '../coverage-local-suite-catalog.mts'

const dbEnv = {
  DATABASE_HOST: 'localhost',
  DATABASE_NAME: 'voucha',
  DATABASE_PASSWORD: 'secret',
  DATABASE_PORT: '5432',
  DATABASE_SSLMODE: 'require',
  DATABASE_URL: 'postgres://localhost/voucha',
  DATABASE_USER: 'postgres',
  PGAPPNAME: 'voucha-tests',
  PGCONNECT_TIMEOUT: '10',
  PGDATABASE: 'voucha',
  PGHOST: 'localhost',
  PGOPTIONS: '-c statement_timeout=1000',
  PGPASSWORD: 'secret',
  PGPORT: '5432',
  PGUSER: 'postgres',
  READ_DATABASE_URL: 'postgres://localhost/voucha-read',
  REDIS_URL: 'redis://localhost:6379',
  VALKEY_ANALYTICS_URL: 'redis://localhost:6379',
  VALKEY_BLOOM_URL: 'redis://localhost:6379',
  VALKEY_CACHE_URL: 'redis://localhost:6379',
  VALKEY_DYNAMIC_CONFIG_READ_URL: 'redis://localhost:6379',
  VALKEY_DYNAMIC_CONFIG_URL: 'redis://localhost:6379',
  VALKEY_DYNAMIC_CONFIG_WRITE_URL: 'redis://localhost:6379',
  VALKEY_RATE_LIMITER_URL: 'redis://localhost:6379',
  VALKEY_SESSION_URL: 'redis://localhost:6379',
  VALKEY_URL: 'redis://localhost:6379',
  VALKEY_WORKER_QUEUE_URL: 'redis://localhost:6379',
}

describe('SUITES configuration', () => {
  it('has unique suite names', () => {
    const names = SUITES.map(s => s.name)
    expect(names).toEqual([...new Set(names)])
  })

  it('has unique project names across all suites', () => {
    const allProjects = SUITES.flatMap(s => s.projects)
    expect(allProjects).toEqual([...new Set(allProjects)])
  })

  it('marks all expected suites as requiring web init', () => {
    expect(SUITES.filter(s => s.requiresWebInit).map(s => s.name)).toEqual([
      'playwright-helpers',
      'backend-data-stores',
      'web-integration',
    ])
    expect(webInitSuiteNames()).toBe('playwright-helpers, backend-data-stores, web-integration')
  })

  it('removes the Worker-to-backend secret from local API coverage suites', () => {
    for (const suiteName of ['web-api', 'web-integration']) {
      expect(LOCAL_COVERAGE_SUITES.find(suite => suite.name === suiteName)?.unsetEnv).toEqual([
        'CF_WORKER_SECRET',
      ])
    }
  })

  it('keeps projects with DB-backed global setup in web-init suites', () => {
    const projectsWithDataStoreGlobalSetup = [
      'backend/analytics-integration',
      'backend-data-stores',
      'backend-mocks',
      'web-api',
      'web-integration',
    ]
    const credentialedProjects = new Set(
      SUITES.filter(s => s.requiresWebInit).flatMap(s => s.projects),
    )

    for (const project of projectsWithDataStoreGlobalSetup) {
      expect(credentialedProjects).toContain(project)
    }
  })

  it('process-wide serializes local coverage that includes destructive capacity tests', () => {
    const backendDataStores = SUITES.find(suite => suite.name === 'backend-data-stores')
    if (!backendDataStores) throw new Error('backend-data-stores suite is missing')

    expect(backendDataStores.projects).toContain('backend-activitypub-capacity')
    expect(backendDataStores.serialExecution).toBe(true)
    expect(suiteCoverageCommand(backendDataStores, '/tmp/coverage')).toMatchObject({
      envPrefix: 'VITEST_MAX_WORKERS=1 ',
      args: expect.arrayContaining(['--no-file-parallelism']),
    })
  })

  it('sets coverageScope for the tooling suite', () => {
    const tooling = SUITES.find(s => s.name === 'tooling')
    expect(tooling).toBeDefined()
    expect(tooling?.coverageScope).toBe('tooling')
  })

  it('isolates Playwright helpers in a web-init tooling coverage suite', () => {
    const tooling = SUITES.find(s => s.name === 'tooling')
    const playwrightHelpers = SUITES.find(s => s.name === 'playwright-helpers')

    expect(tooling?.projects).not.toContain('playwright-helpers')
    expect(playwrightHelpers).toMatchObject({
      projects: dbBackedToolingProjectNames,
      coverageScope: 'tooling',
      requiresWebInit: true,
      sourcePatterns: ['playwright/helpers/**'],
    })
    expect(tooling?.projects).toEqual(localCoverageToolingProjectNames)
  })

  it('includes ts-shared, web, and web-storybook as non-credentialed suites', () => {
    const nonCredentialed: string[] = []
    for (const s of SUITES) {
      if (!s.requiresWebInit) nonCredentialed.push(s.name)
    }
    expect(nonCredentialed).toContain('ts-shared')
    expect(nonCredentialed).toContain('web')
    expect(nonCredentialed).toContain('web-storybook')
  })
})

describe('hasWebInit', () => {
  let tmpDir: string

  afterAll(async () => {
    // temp dirs cleaned up by OS on test runner exit
  })

  it('returns false when .initialized is absent', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'voucha-coverage-test-'))
    expect(hasWebInit(tmpDir)).toBe(false)
  })

  it('returns false when .initialized exists but does not contain "web"', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'voucha-coverage-test-'))
    await writeFile(join(tmpDir, '.initialized'), 'monorepo')
    expect(hasWebInit(tmpDir)).toBe(false)
  })

  it('returns false when .initialized has extra modes and .env exists', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'voucha-coverage-test-'))
    await writeFile(join(tmpDir, '.initialized'), 'monorepo web')
    await writeFile(join(tmpDir, '.env'), 'DATABASE_URL=postgres://localhost/test')
    expect(hasWebInit(tmpDir)).toBe(false)
  })

  it('returns false when .initialized is web but .env is absent', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'voucha-coverage-test-'))
    await writeFile(join(tmpDir, '.initialized'), 'web')
    expect(hasWebInit(tmpDir)).toBe(false)
  })

  it('returns true when .initialized is "web" and .env exists', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'voucha-coverage-test-'))
    await writeFile(join(tmpDir, '.initialized'), 'web')
    await writeFile(join(tmpDir, '.env'), 'DATABASE_URL=postgres://localhost/test')
    expect(hasWebInit(tmpDir)).toBe(true)
  })
})

describe('envForSuite', () => {
  it('strips DB and Valkey env vars from suites that do not require web init', () => {
    const suite: Suite = {
      name: 'ts-shared',
      projects: ['ts-shared'],
      sourcePatterns: ['ts-shared/**'],
    }
    const env = envForSuite(suite, { ...dbEnv, KEEP_ME: 'yes' })

    expect(env).toEqual({ BASH_ENV: '/dev/null', KEEP_ME: 'yes' })
  })

  it('preserves DB and Valkey env vars for suites that require web init', () => {
    const suite: Suite = {
      name: 'web-integration',
      projects: ['web-integration', 'web-api'],
      requiresWebInit: true,
      sourcePatterns: [
        'web/lib/api/**',
        'integration-tests/web/**',
        'integration-tests/web-api/**',
      ],
    }

    expect(envForSuite(suite, { ...dbEnv, KEEP_ME: 'yes' })).toEqual({
      ...dbEnv,
      KEEP_ME: 'yes',
    })
  })

  it('sets the Vitest coverage scope for suites that define one', () => {
    const suite: Suite = {
      coverageScope: 'tooling',
      name: 'tooling',
      projects: ['ci-tools'],
      sourcePatterns: ['ci/**', 'dev/**'],
    }

    const env = envForSuite(suite, { ...dbEnv })

    expect(env.VITEST_COVERAGE_SCOPE).toBe('tooling')
    expect(env).not.toHaveProperty('DATABASE_URL')
    expect(env).not.toHaveProperty('VALKEY_URL')
  })
})
