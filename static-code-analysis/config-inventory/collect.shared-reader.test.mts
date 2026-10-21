import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { collectConfigInventory } from './collect.mts'
import { checkWorkflowEnvReferences } from './workflow-env-policy.mts'
import { checkImagePublisherTestRole } from './image-publisher-test-role-policy.mts'
import { makeRepoFixture } from '../test-helpers/config-inventory/repo-fixture.mts'

describe('collectConfigInventory shared reader', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('uses the shared reader and skips the generated PostgreSQL snapshot and catalog', async () => {
    const files = {
      'backend/config/example.mts': 'process.env.SHARED_READER_ENV\n',
      'backend/data-stores/psql/schema-snapshot/schema.json':
        '{"generated":"process.env.GENERATED_ARTIFACT_ENV"}',
      'backend/data-stores/psql/schema-snapshot/no-mistakes-catalog.json':
        '{"generated":"process.env.GENERATED_CATALOG_ENV"}',
      'package.json': '{"scripts":{}}',
    }
    const fixture = await makeRepoFixture(files)
    testDirs.push(fixture.dir)
    fixture.ctx.readTrackedFile = vi.fn<(file: string) => string | null>(
      file => files[file as keyof typeof files] ?? null,
    )

    const inventory = await collectConfigInventory(fixture.ctx)

    expect(inventory.envVars).toEqual([expect.objectContaining({ name: 'SHARED_READER_ENV' })])
    expect(fixture.ctx.readTrackedFile).toHaveBeenCalledTimes(2)
  })

  it('reads package-manager gates only from pnpm-workspace.yaml', async () => {
    const fixture = await makeRepoFixture({
      'package.json': 'minimumReleaseAge: 2880\n',
      'pnpm-workspace.yaml': 'minimumReleaseAge: 1440\n',
    })
    testDirs.push(fixture.dir)

    const inventory = await collectConfigInventory(fixture.ctx)

    expect(inventory.packageGates).toEqual([
      {
        name: 'minimumReleaseAge',
        values: ['1440'],
        files: ['pnpm-workspace.yaml'],
      },
    ])
  })

  it('does not bypass an unreadable shared source with physical file contents', async () => {
    const fixture = await makeRepoFixture({
      'backend/config/unreadable.mts': 'process.env.HIDDEN_SOURCE_ENV',
    })
    testDirs.push(fixture.dir)
    fixture.ctx.readTrackedFile = () => null
    expect((await collectConfigInventory(fixture.ctx)).envVars).toEqual([])
  })

  it('retains typed metadata, constructor carriers and action-versus-workflow routing with finite sources', async () => {
    const fixture = await makeRepoFixture({
      'backend/config/finite.mts': `const LOCAL_KEY = 'dynamic-config:fixture-constant'
new DynamicConfig({ key: "fixture-double", })
new DynamicConfig({ key: LOCAL_KEY, })
new DynamicConfig({ key: UNRESOLVED_KEY, })
process.env.NEXT_PUBLIC_FIXTURE`,
      'ts-shared/env-contract/index.mts': `export const ENV_VAR_CONTRACT = [{ name: 'METADATA_FIXTURE', key: 'fixture-key', source: 'fixture-owner', surfaces: ['worker'] }]`,
      '.github/actions/fixture/action.yml':
        'runs:\n  using: composite\n  steps:\n    - env:\n        ACTION_ONLY_ENV: fixture\n',
    })
    testDirs.push(fixture.dir)
    const inventory = await collectConfigInventory(fixture.ctx)
    expect(inventory.dynamicConfigs.map(row => row.namespace)).toEqual([
      'fixture-constant',
      'fixture-double',
    ])
    expect(inventory.envVars).toContainEqual(
      expect.objectContaining({
        name: 'METADATA_FIXTURE',
        contractKey: 'fixture-key',
        sourceOfTruth: 'fixture-owner',
        runtimeSurfaces: ['worker'],
      }),
    )
    expect(inventory.envVars).toContainEqual(
      expect.objectContaining({
        name: 'NEXT_PUBLIC_FIXTURE',
        classifications: expect.arrayContaining(['build-time']),
      }),
    )
    expect(checkWorkflowEnvReferences(fixture.ctx, inventory)).toEqual([])
  })

  it('retains the documented no-ECR AWS test-role contract with bounded publisher inputs', async () => {
    const files = {
      'docs/overview/infrastructure/environment-variables.md': '`AWS_TEST_ROLE_ARN`',
      'docs/development/reference-ci-ci-job-conditions.md':
        '`AWS_TEST_ROLE_ARN` is the image publisher test role.',
      '.github/workflows/publish-backend-images.yml':
        'on:\n  workflow_call:\n    secrets:\n      AWS_TEST_ROLE_ARN:\n        required: true\n',
      '.github/workflows/publish-web-images.yml':
        'on:\n  workflow_call:\n    secrets:\n      AWS_TEST_ROLE_ARN:\n        required: true\n',
    }
    const fixture = await makeRepoFixture(files)
    testDirs.push(fixture.dir)
    const inventory = await collectConfigInventory(fixture.ctx)
    expect(checkImagePublisherTestRole(inventory)).toEqual([])
    expect(checkWorkflowEnvReferences(fixture.ctx, inventory)).toEqual([])
    for (const missing of Object.keys(files).filter(
      path => !path.endsWith('/environment-variables.md'),
    )) {
      const finite = { ...files }
      delete finite[missing as keyof typeof finite]
      const negative = await makeRepoFixture(finite)
      testDirs.push(negative.dir)
      const result = await collectConfigInventory(negative.ctx)
      expect(checkImagePublisherTestRole(result)).toEqual([
        missing.endsWith('.md')
          ? `AWS_TEST_ROLE_ARN must be documented in ${missing}`
          : `AWS_TEST_ROLE_ARN must be referenced by ${missing}`,
      ])
    }
    expect(
      checkImagePublisherTestRole({ envVars: [], dynamicConfigs: [], packageGates: [] }),
    ).toHaveLength(3)
  })
})
