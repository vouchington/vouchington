import { describe, expect, it } from 'vitest'
import picomatch from 'picomatch'
import config from '../vitest.config.mts'
import type { TestProjectConfiguration, TestProjectInlineConfiguration } from 'vitest/config'
import { backendDataProjects } from '../test-helpers/vitest-config/backend-data-projects.mts'

interface BackendProject {
  resolve?: { alias?: Array<{ find: RegExp; replacement: string }> }
  test?: {
    exclude?: string[]
    globalSetup?: string | string[]
    hookTimeout?: number
    include?: string[]
    isolate?: boolean
    name?: string
    env?: Record<string, string>
    pool?: string
    runner?: string
    sequence?: { groupOrder?: number }
    setupFiles?: string[]
    testTimeout?: number
  }
}

const isInlineProject = (
  project: TestProjectConfiguration,
): project is TestProjectInlineConfiguration =>
  typeof project === 'object' && project !== null && !('then' in project)

const projects = (config.test?.projects ?? []).filter(isInlineProject) as BackendProject[]
const projectOwnsPath = (project: BackendProject, path: string) =>
  (project.test?.include ?? []).some(pattern => picomatch.isMatch(path, pattern)) &&
  !(project.test?.exclude ?? []).some(pattern => picomatch.isMatch(path, pattern))

describe('backend batch-quota Vitest projects', () => {
  it('routes global batch-quota readers through four exclusive ordered projects', () => {
    const readers = [
      {
        path: 'backend/services/bedrock-embeddings-batch/rate-limits.test.mts',
        project: 'backend-bedrock-rate-limits',
        groupOrder: 1,
      },
      {
        path: 'backend/services/bedrock-embeddings/batch/orchestrator/__tests__/poll-queries.test.mts',
        project: 'backend-bedrock-poll-queries',
        groupOrder: 2,
      },
      {
        path: 'backend/workers/bedrock-embeddings-batch/processors/creation-worker.real-glide.mock.test.mts',
        project: 'backend-real-glide-creation-worker',
        groupOrder: 3,
      },
      {
        path: 'backend/workers/bedrock-embeddings-batch/processors/creation.real-glide.mock.test.mts',
        project: 'backend-real-glide-creation',
        groupOrder: 4,
      },
    ]

    for (const reader of readers) {
      const owners = projects.filter(project => projectOwnsPath(project, reader.path))
      expect(owners.map(project => project.test?.name)).toEqual([reader.project])
      expect(owners[0]?.test).toMatchObject({
        sequence: { groupOrder: reader.groupOrder },
        testTimeout: 30_000,
        hookTimeout: 30_000,
        exclude: ['**/node_modules/**', '**/.git/**'],
      })
    }
    expect(readers.map(reader => reader.groupOrder).toSorted()).toEqual([1, 2, 3, 4])

    const dataReaders = readers
      .slice(0, 2)
      .map(reader => projects.find(project => project.test?.name === reader.project))
    for (const project of dataReaders) {
      expect(project?.test?.globalSetup).toBe('./test-helpers/vitest.setup.data-stores.mts')
      expect(project?.test?.runner).toBe('./test-helpers/vitest.runner.backend-data-guards.mts')
      expect(project?.test?.env?.PG_TEST_STATEMENT_TIMEOUT_MS).toBe(
        process.env.PG_TEST_STATEMENT_TIMEOUT_MS ?? '20000',
      )
      expect(project?.test?.setupFiles).toEqual(
        backendDataProjects
          .filter(isInlineProject)
          .find(item => item.test?.name === 'backend-data-stores')?.test?.setupFiles,
      )
    }

    const realGlideReaders = readers
      .slice(2)
      .map(reader => projects.find(project => project.test?.name === reader.project))
    const realGlideAliases = projects.find(
      project => project.test?.name === 'backend-real-glide-mq',
    )?.resolve?.alias
    for (const project of realGlideReaders) {
      expect(project?.test).toMatchObject({
        pool: 'forks',
        isolate: true,
        setupFiles: ['./test-helpers/vitest.setup.postgres-sessions.mts'],
        env: {
          PG_TEST_STATEMENT_TIMEOUT_MS: process.env.PG_TEST_STATEMENT_TIMEOUT_MS ?? '20000',
        },
      })
      expect(project?.test?.globalSetup).toBeUndefined()
      expect(project?.resolve?.alias).toEqual(realGlideAliases)
    }
  })
})
