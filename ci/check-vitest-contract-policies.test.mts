import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkWorkflowAreaCoveragePolicy } from './check-workflow-area-coverage-policy.mts'
import { checkVitestProjectCommandPolicy } from './check-vitest-project-command-policy.mts'
import { checkVitestReporterPolicy } from './check-vitest-reporter-policy.mts'
import {
  areaCoverageDocuments,
  areaCoverageSources,
} from './test-helpers/workflow-area-coverage-fixtures.mts'
import { createVitestProjectCommandFixture } from './test-helpers/vitest-project-command-fixtures.mts'
import { reporterWorkflowFixtures } from './test-helpers/vitest-reporter-fixtures.mts'
import {
  createTrackedPolicyFixture,
  writeTrackedPolicyFixture,
} from './test-helpers/tracked-policy-fixture.mts'

const nestedYaml = { '.github/workflows/nested/ignored.yml': 'invalid: [' }

describe('tracked Vitest workflow contract checkers', () => {
  it('checks area coverage over tracked top-level workflows and rejects a broken gate', async () => {
    const documents = areaCoverageDocuments()
    const root = await createTrackedPolicyFixture({
      ...areaCoverageSources(documents),
      ...nestedYaml,
    })
    await writeFile(join(root, '.github/workflows/untracked.yml'), 'invalid: [')
    expect(checkWorkflowAreaCoveragePolicy(root)).toEqual([])

    documents['.github/workflows/backend.yml']!.jobs!.backend!.needs = ['first']
    await writeTrackedPolicyFixture(
      root,
      '.github/workflows/backend.yml',
      areaCoverageSources(documents)['.github/workflows/backend.yml']!,
    )
    expect(checkWorkflowAreaCoveragePolicy(root)).toEqual([
      'backend: required gate needs patch coverage',
    ])
  })

  it('checks fixture metadata and rejects a command that selects an individual file', async () => {
    const sources = createVitestProjectCommandFixture()
    const root = await createTrackedPolicyFixture({ ...sources, ...nestedYaml })
    expect(checkVitestProjectCommandPolicy(root, ['static-analysis-ast-grep'])).toEqual([])

    const path = '.github/workflows/tests-web.yml'
    await writeTrackedPolicyFixture(
      root,
      path,
      sources[path]!.replace('--project synthetic-suite', '--project synthetic-suite bad.test.ts'),
    )
    expect(checkVitestProjectCommandPolicy(root, ['static-analysis-ast-grep'])).toEqual([
      '.github/workflows/tests-web.yml has a Vitest command selecting an individual test file',
    ])
  })

  it('checks JUnit uploads and rejects a broken retention field', async () => {
    const sources = reporterWorkflowFixtures()
    const root = await createTrackedPolicyFixture({ ...sources, ...nestedYaml })
    expect(checkVitestReporterPolicy(root)).toEqual([])

    const path = '.github/workflows/tests-web.yml'
    await writeTrackedPolicyFixture(
      root,
      path,
      sources[path]!.replace('retention-days: 1', 'retention-days: 2'),
    )
    expect(checkVitestReporterPolicy(root)).toEqual([
      '.github/workflows/tests-web.yml: web-tests JUnit upload policy',
    ])
  })
})
