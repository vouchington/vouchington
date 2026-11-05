import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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

    expect(inventory.envVars.filter(row => row.contractKey === null)).toEqual([
      expect.objectContaining({ name: 'SHARED_READER_ENV' }),
    ])
    expect(inventory.envVars).not.toContainEqual(
      expect.objectContaining({ name: 'GENERATED_ARTIFACT_ENV' }),
    )
    expect(inventory.envVars).not.toContainEqual(
      expect.objectContaining({ name: 'GENERATED_CATALOG_ENV' }),
    )
    expect(fixture.ctx.readTrackedFile).toHaveBeenCalledTimes(2)
  })

  it('discovers tracked workflow shell consumers without accepting stale or untracked readers', async () => {
    const workflowPath = '.github/workflows/ci.yml'
    const scriptPath = '.github/workflows/dependency-mirror.sh'
    const actionPath = '.github/actions/fixture/publish.sh'
    const actionDefinitionPath = '.github/actions/fixture/action.yml'
    const fixture = await makeRepoFixture({
      [workflowPath]: [
        'jobs:',
        '  mirror:',
        '    steps:',
        '      - env:',
        '          GHCR_TOKEN: fixture',
        '          REGCTL: fixture',
        '          REGCTL_PATH: fixture',
        '          GHCR_NAMESPACE: fixture',
        '          IMAGE_REPOSITORY: fixture',
        '          STALE_SHELL_ENV: fixture',
        '          SKIPPED_WORKFLOW_ENV: fixture',
        '          UNTRACKED_WORKFLOW_ENV: fixture',
        '        run: source "$GITHUB_WORKSPACE/.github/workflows/dependency-mirror.sh"',
      ].join('\n'),
      [scriptPath]: [
        '#!/usr/bin/env bash',
        '"$REGCTL" registry login --pass "$GHCR_TOKEN"',
        'printf "%s" "${REGCTL_PATH}"',
        'printf "%s" "${GHCR_NAMESPACE}/web:$IMAGE_TAG"',
        'printf "%s" "${IMAGE_REPOSITORY}/web:$IMAGE_TAG"',
        'printf "%s" "$STALE_SHELL_ENV_EXTRA" "$SHELL_LOCAL_ONLY"',
      ].join('\n'),
      '.github/workflows/ignored.test.sh': 'echo "$SKIPPED_WORKFLOW_ENV"',
      [actionDefinitionPath]: [
        'runs:',
        '  using: composite',
        '  steps:',
        '    - shell: bash',
        '      env:',
        '        ACTION_SHELL_ENV: fixture',
        '      run: bash "$GITHUB_ACTION_PATH/publish.sh"',
      ].join('\n'),
      [actionPath]: '#!/usr/bin/env bash\necho "${ACTION_SHELL_ENV}"',
      '.github/actions/fixture/ignored.test.sh': 'echo "$SKIPPED_ACTION_ENV"',
    })
    testDirs.push(fixture.dir)
    await writeFile(
      join(fixture.dir, '.github/workflows/untracked.sh'),
      'echo "$UNTRACKED_WORKFLOW_ENV"',
    )
    await writeFile(
      join(fixture.dir, '.github/actions/fixture/untracked.sh'),
      'echo "${UNTRACKED_ACTION_ENV}"',
    )

    const inventory = await collectConfigInventory(fixture.ctx)

    for (const name of [
      'GHCR_TOKEN',
      'REGCTL',
      'REGCTL_PATH',
      'GHCR_NAMESPACE',
      'IMAGE_REPOSITORY',
    ]) {
      expect(inventory.envVars).toContainEqual(
        expect.objectContaining({ name, readers: [scriptPath], workflows: [workflowPath] }),
      )
    }
    expect(inventory.envVars).toContainEqual(
      expect.objectContaining({
        name: 'ACTION_SHELL_ENV',
        readers: [actionPath],
        workflows: [actionDefinitionPath],
      }),
    )
    expect(inventory.envVars).not.toContainEqual(
      expect.objectContaining({ name: 'SHELL_LOCAL_ONLY' }),
    )
    expect(inventory.envVars).not.toContainEqual(
      expect.objectContaining({ name: 'SKIPPED_ACTION_ENV' }),
    )
    expect(inventory.envVars).not.toContainEqual(
      expect.objectContaining({ name: 'UNTRACKED_ACTION_ENV' }),
    )
    expect(checkWorkflowEnvReferences(fixture.ctx, inventory)).toEqual(
      ['SKIPPED_WORKFLOW_ENV', 'STALE_SHELL_ENV', 'UNTRACKED_WORKFLOW_ENV'].map(
        name =>
          `workflow env ${name} in ${workflowPath} is not referenced by repo code; remove it or add an explicit config-inventory allowlist reason`,
      ),
    )
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
    const inventory = await collectConfigInventory(fixture.ctx)
    expect(inventory.envVars.filter(row => row.contractKey === null)).toEqual([])
    expect(inventory.envVars).not.toContainEqual(
      expect.objectContaining({ name: 'HIDDEN_SOURCE_ENV' }),
    )
    expect(inventory.envVars).toContainEqual(
      expect.objectContaining({
        name: 'STRIPE_SECRET_KEY',
        contractKey: 'vouchington-infra:ecs-backend-secret+ecs-worker-secret:STRIPE_SECRET_KEY',
      }),
    )
  })

  it('retains typed metadata, constructor carriers and action-versus-workflow routing with finite sources', async () => {
    const fixture = await makeRepoFixture({
      'backend/config/finite.mts': `const LOCAL_KEY = 'dynamic-config:fixture-constant'
new DynamicConfig({ key: "fixture-double", })
new DynamicConfig({ key: LOCAL_KEY, })
new DynamicConfig({ key: UNRESOLVED_KEY, })
process.env.NEXT_PUBLIC_FIXTURE`,
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
        name: 'STRIPE_SECRET_KEY',
        contractKey: 'vouchington-infra:ecs-backend-secret+ecs-worker-secret:STRIPE_SECRET_KEY',
        sourceOfTruth: 'vouchington-infra',
        sensitivity: 'secret',
        runtimeSurfaces: ['ecs-backend-secret', 'ecs-worker-secret'],
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
