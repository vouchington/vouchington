import { mergeConfig } from 'vitest/config'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import picomatch from 'picomatch'
import config from '../vitest.config.mts'

import { backendCoreProjects } from '../test-helpers/vitest-config/backend-core-projects.mts'
import { backendDataProjects } from '../test-helpers/vitest-config/backend-data-projects.mts'
import { realGlideMqAlias } from '../test-helpers/vitest-config/aliases.mts'
import { TEST_STATEMENT_TIMEOUT_MS } from '../backend/test-helpers/statement-timeout-constant.mts'

interface BackendProject {
  extends?: boolean
  resolve?: {
    alias?: Array<{ find: RegExp; replacement: string }>
  }
  test?: {
    exclude?: string[]
    globalSetup?: string
    hookTimeout?: number
    include?: string[]
    isolate?: boolean
    name?: string
    pool?: string
    runner?: string
    setupFiles?: string[]
    testTimeout?: number
  }
}

const realGlideProject = (): BackendProject['test'] => {
  const projects = config.test?.projects as BackendProject[] | undefined
  return projects?.find(project => project.test?.name === 'backend-real-glide-mq')?.test
}

const realGlideProjectConfig = (): BackendProject | undefined => {
  const projects = config.test?.projects as BackendProject[] | undefined
  return projects?.find(project => project.test?.name === 'backend-real-glide-mq')
}

const backendProjects = (): BackendProject[] => [
  ...(backendCoreProjects as BackendProject[]),
  ...(backendDataProjects as BackendProject[]),
]

function projectOwnsPath(project: BackendProject, path: string): boolean {
  const includes = project.test?.include ?? []
  const excludes = project.test?.exclude ?? []
  return (
    includes.some(pattern => picomatch.isMatch(path, pattern)) &&
    !excludes.some(pattern => picomatch.isMatch(path, pattern))
  )
}

describe('backend Vitest project config', () => {
  it('registers the GlideMQ attachment guard runner only for backend-data-stores', () => {
    const runner = './test-helpers/vitest.runner.glide-mq-worker-attachment-guard.mts'
    const projects = config.test?.projects as BackendProject[] | undefined
    const owners = projects?.filter(project => project.test?.runner === runner) ?? []
    const dataStores = backendProjects().find(
      project => project.test?.name === 'backend-data-stores',
    )?.test
    const capacity = backendProjects().find(
      project => project.test?.name === 'backend-activitypub-capacity',
    )?.test

    expect(owners.map(project => project.test?.name)).toEqual(['backend-data-stores'])
    expect(dataStores?.runner).toBe(runner)
    expect(capacity?.runner).toBeUndefined()
    expect(realGlideProject()?.runner).toBeUndefined()
  })

  it('raises the Valkey request budget before DB-backed setup creates clients', () => {
    const setupSource = readFileSync('test-helpers/vitest.setup.data-stores.mts', 'utf8')
    const timeoutAssignment = setupSource.indexOf(
      "process.env.VALKEY_REQUEST_TIMEOUT_MS ??= '5000'",
    )
    const setupFunction = setupSource.indexOf('export async function setup()')

    expect(timeoutAssignment).toBeGreaterThan(-1)
    expect(timeoutAssignment).toBeLessThan(setupFunction)
  })

  it('keeps every fork-leak project backed by data-store global setup', () => {
    const projects = config.test?.projects as BackendProject[] | undefined
    const forkLeakProjects =
      projects?.filter(project =>
        project.test?.setupFiles?.includes('./test-helpers/vitest.setup.fork-leak-detection.mts'),
      ) ?? []

    expect(forkLeakProjects).not.toHaveLength(0)
    expect(
      forkLeakProjects.map(project => ({
        name: project.test?.name,
        globalSetup: project.test?.globalSetup,
      })),
    ).toEqual(
      forkLeakProjects.map(project => ({
        name: project.test?.name,
        globalSetup: './test-helpers/vitest.setup.data-stores.mts',
      })),
    )
  })

  it('serializes the ActivityPub capacity boundary outside the shared backend project', () => {
    const capacity = backendProjects().find(
      project => project.test?.name === 'backend-activitypub-capacity',
    )?.test

    expect(capacity).toMatchObject({ isolate: false })
    expect(capacity).not.toHaveProperty('fileParallelism')
    expect(capacity?.include).toEqual([
      'backend/api/activitypub/inbox-capacity.test.mts',
      'backend/services/ap-inbox-activities/activitypub-inbox-capacity.test.mts',
    ])
  })

  it('isolates the real GlideMQ transport contract without global queue setup', () => {
    expect(realGlideProject()).toMatchObject({
      pool: 'forks',
      isolate: true,
      include: ['backend/**/*.real-glide.mock.test.mts'],
      setupFiles: ['./test-helpers/vitest.setup.fork-exit-sentinel.mts'],
    })
    expect(realGlideProject()?.globalSetup).toBeUndefined()
  })

  it('resolves GlideMQ to the installed package after inheriting root aliases', () => {
    const project = realGlideProjectConfig()
    const effectiveConfig = mergeConfig({ resolve: config.resolve }, project ?? {})
    const effectiveAliases = effectiveConfig.resolve?.alias as
      | Array<{ find: RegExp; replacement: string }>
      | undefined
    const glideMqAlias = effectiveAliases?.find(alias => alias.find.test('glide-mq'))

    expect(project?.extends).toBe(true)
    expect(glideMqAlias).toEqual(realGlideMqAlias())
    expect(glideMqAlias?.replacement).not.toContain('glide-mq-vitest-shim')
  })

  it('keeps no-data mocks disjoint from DB-backed mocks without service setup', () => {
    const noDataMocks = backendProjects().find(
      project => project.test?.name === 'backend-no-data-mocks',
    )?.test
    const dataMocks = backendProjects().find(
      project => project.test?.name === 'backend-mocks',
    )?.test

    expect(noDataMocks).toMatchObject({
      include: ['backend/**/*.no-data.mock.test.mts'],
      isolate: true,
      pool: 'forks',
      setupFiles: [
        './backend/test-helpers/vitest.setup.sentry-mock.mts',
        './backend/test-helpers/vitest.setup.aws-mocks.mts',
      ],
    })
    expect(noDataMocks?.globalSetup).toBeUndefined()
    expect(noDataMocks?.setupFiles).not.toEqual(
      expect.arrayContaining([
        './test-helpers/vitest.setup.dynamic-config-isolation.mts',
        './test-helpers/vitest.setup.glide-mq-workers.mts',
      ]),
    )
    expect(dataMocks?.exclude).toContain('**/*.no-data.mock.test.mts')
  })

  it('keeps every no-data mock owned by exactly one project', () => {
    const noDataMocks = backendProjects().find(
      project => project.test?.name === 'backend-no-data-mocks',
    )?.test
    const dataMocks = backendProjects().find(
      project => project.test?.name === 'backend-mocks',
    )?.test

    expect(noDataMocks?.include).toEqual(['backend/**/*.no-data.mock.test.mts'])
    expect(dataMocks?.include).toContain(
      'backend/{agents,api,modules,data-stores,entrypoints,flows,queues,scripts,services,sitemaps,tools,worker-runtime,workers}/**/*.mock.test.mts',
    )
    expect(dataMocks?.exclude).toContain('**/*.no-data.mock.test.mts')
  })

  it('excludes nested dependency tests from broad backend project globs', () => {
    const broadBackendProjects = backendProjects().filter(project => {
      const include = project.test?.include
      return include?.some(pattern => pattern.startsWith('backend/') && pattern.includes('**/'))
    })

    expect(broadBackendProjects.map(project => project.test?.name)).toContain(
      'backend/services/analytics',
    )
    expect(broadBackendProjects).not.toHaveLength(0)
    expect(
      broadBackendProjects.filter(
        project => !project.test?.exclude?.includes('**/node_modules/**'),
      ),
    ).toEqual([])
  })

  it('folds the seed CSV import back into ordinary backend-data-stores coverage', () => {
    const dataStores = backendProjects().find(
      project => project.test?.name === 'backend-data-stores',
    )?.test

    expect(
      backendProjects().find(project => project.test?.name === 'backend-seed-csvs'),
    ).toBeUndefined()
    expect(dataStores?.exclude ?? []).not.toContain(
      'backend/services/admin-imports/seed-csvs.test.mts',
    )
  })

  it('folds the report pagination matrices back into ordinary backend-data-stores coverage', () => {
    const dataStores = backendProjects().find(
      project => project.test?.name === 'backend-data-stores',
    )?.test

    expect(
      backendProjects().find(project => project.test?.name === 'backend-report-pagination'),
    ).toBeUndefined()
    expect(dataStores?.exclude ?? []).not.toContain(
      'backend/api/v1/reports/__tests__/reports.clustered-pagination-matrix.test.mts',
    )
    expect(dataStores?.exclude ?? []).not.toContain(
      'backend/api/v1/reports/__tests__/reports.flat-pagination-matrix.test.mts',
    )
  })

  it('keeps TEST_STATEMENT_TIMEOUT_MS strictly below the backend-data-stores project testTimeout', () => {
    // Guards the boundStatementTimeoutForTestDatabase() call in vitest.setup.data-stores.mts:
    // without it, statement_timeout is unbounded in tests (0, from getPsqlPoolConfiguration()'s
    // test branch) and a stuck query fails only via vitest's opaque, unattributed testTimeout.
    // A hardcoded fallback here would defeat the point: this must track the real config so the
    // two numbers cannot silently drift back into the inversion this bound exists to prevent.
    const dataStores = backendProjects().find(
      project => project.test?.name === 'backend-data-stores',
    )?.test

    expect(typeof dataStores?.testTimeout).toBe('number')
    expect(TEST_STATEMENT_TIMEOUT_MS).toBeLessThan(dataStores?.testTimeout as number)
  })

  it('isolates the Crawler RSS analytics contract in exactly one project', () => {
    const path = 'backend/services/crawler-rss/index.redirect.test.mts'
    const projects = config.test?.projects as BackendProject[] | undefined
    const owners = projects?.filter(project => projectOwnsPath(project, path)) ?? []

    expect(owners.map(project => project.test?.name)).toEqual(['backend/services/analytics'])
    expect(owners[0]?.test).toMatchObject({
      isolate: true,
      setupFiles: expect.arrayContaining([
        './backend/test-helpers/vitest.setup.analytics-local-env.mts',
      ]),
    })

    const setupSource = readFileSync(
      'backend/test-helpers/vitest.setup.analytics-local-env.mts',
      'utf8',
    )
    expect(setupSource).toContain("process.env.ANALYTICS_BACKEND = 'local'")
    expect(setupSource).not.toContain('process.env.ANALYTICS_BACKEND ??=')
    expect(setupSource).toContain('await flush()')
    expect(setupSource).toContain('try {')
    expect(setupSource).toContain('} finally {')
  })
})
