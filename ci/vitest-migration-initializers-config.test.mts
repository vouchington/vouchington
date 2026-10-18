import { readFileSync } from 'node:fs'
import picomatch from 'picomatch'
import { describe, expect, it } from 'vitest'
import config from '../vitest.config.mts'

const target = 'backend/data-stores/psql/migrate.mock.test.mts'
const projects = (config.test?.projects ?? []).flatMap(project =>
  typeof project === 'object' && project !== null && 'test' in project && project.test
    ? [project.test]
    : [],
)

describe('migration initializer fault project', () => {
  it('owns only the two-case file and registers the same external mocks before normal setup', () => {
    const ordinary = projects.find(project => project.name === 'backend-mocks')
    const dedicated = projects.find(project => project.name === 'backend-migration-initializers')
    expect(dedicated?.include).toEqual([target])
    expect(dedicated).toMatchObject({
      isolate: true,
      pool: 'forks',
      sequence: { setupFiles: 'list' },
      runner: ordinary?.runner,
      globalSetup: './test-helpers/vitest.setup.data-stores.mts',
      testTimeout: 5_000,
      hookTimeout: 5_000,
    })
    const ordinarySetup = ordinary?.setupFiles
    if (!Array.isArray(ordinarySetup))
      throw new Error('Expected ordered backend mock setup files', { cause: ordinarySetup })
    expect(dedicated?.setupFiles).toEqual([
      './backend/test-helpers/vitest.setup.migration-initializers.mts',
      ...ordinarySetup,
    ])
    expect(ordinary?.exclude).toContain(target)
    for (const file of [target, 'backend/data-stores/psql/example.mock.test.mts']) {
      const owners = projects.filter(
        project =>
          (project.include ?? []).some(pattern => picomatch.isMatch(file, pattern)) &&
          !(project.exclude ?? []).some(pattern => picomatch.isMatch(file, pattern)),
      )
      expect(owners.map(project => project.name)).toEqual([
        file === target ? 'backend-migration-initializers' : 'backend-mocks',
      ])
    }
  })

  it('executes the project in the real automatic backend-unit command', () => {
    const workflow = readFileSync('.github/workflows/tests-backend-unit.yml', 'utf8')
    expect(workflow).toContain('--project backend-mocks --project backend-migration-initializers ')
  })
})
