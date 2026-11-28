import { mergeConfig } from 'vitest/config'
import { describe, expect, it } from 'vitest'
import config from '../vitest.config.mts'
import { backendCoreProjects } from '../test-helpers/vitest-config/backend-core-projects.mts'
import { backendDataProjects } from '../test-helpers/vitest-config/backend-data-projects.mts'
import { realGlideMqAlias } from '../test-helpers/vitest-config/aliases.mts'
interface BackendProject {
  extends?: boolean
  resolve?: {
    alias?: Array<{ find: RegExp; replacement: string }>
  }
  test?: {
    exclude?: string[]
    globalSetup?: string | string[]
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
const realGlideProjectConfig = (): BackendProject | undefined => {
  const projects = config.test?.projects as BackendProject[] | undefined
  return projects?.find(project => project.test?.name === 'backend-real-glide-mq')
}
const backendProjects = (): BackendProject[] =>
  (backendCoreProjects as BackendProject[]).concat(backendDataProjects as BackendProject[])
describe('backend Vitest project config', () => {
  it('registers request query timing before the database setup in profiled projects', () => {
    const projects = config.test?.projects as BackendProject[] | undefined
    const profiledProjects =
      projects?.filter(project =>
        project.test?.setupFiles?.includes('./test-helpers/vitest.setup.request-query-timing.mts'),
      ) ?? []

    expect(profiledProjects).not.toHaveLength(0)
    for (const project of profiledProjects) {
      const setupFiles = project.test?.setupFiles ?? []
      expect(
        setupFiles.indexOf('./test-helpers/vitest.setup.request-query-timing.mts'),
      ).toBeGreaterThanOrEqual(0)
      expect(
        setupFiles.indexOf('./test-helpers/vitest.setup.request-query-timing.mts'),
      ).toBeLessThan(setupFiles.indexOf('./test-helpers/vitest.setup.shared-db-scope-guard.mts'))
    }
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
        globalSetup: [project.test?.globalSetup].flat(),
      })),
    ).toEqual(
      forkLeakProjects.map(project => ({
        name: project.test?.name,
        globalSetup: expect.arrayContaining(['./test-helpers/vitest.setup.data-stores.mts']),
      })),
    )
  })

  it('resolves GlideMQ to the installed package after inheriting root aliases', () => {
    const project = realGlideProjectConfig()
    const effectiveConfig = mergeConfig({ resolve: config.resolve }, { resolve: project?.resolve })
    const effectiveAliases = effectiveConfig.resolve?.alias as
      | Array<{ find: RegExp; replacement: string }>
      | undefined
    const glideMqAlias = effectiveAliases?.find(alias => alias.find.test('glide-mq'))

    expect(project?.extends).toBe(true)
    expect(glideMqAlias).toEqual(realGlideMqAlias())
  })

  it('excludes nested dependency tests from broad backend project globs', () => {
    const broadBackendProjects = backendProjects().filter(project => {
      const include = project.test?.include
      return include?.some(pattern => pattern.startsWith('backend/') && pattern.includes('**/'))
    })

    expect(broadBackendProjects).not.toHaveLength(0)
    expect(
      broadBackendProjects.filter(
        project => !project.test?.exclude?.includes('**/node_modules/**'),
      ),
    ).toEqual([])
  })
})
