import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSharedContext } from 'vouchington-tooling/shared-context'

import { collectConfigInventory } from './collect.mts'
import { checkWorkflowEnvReferences } from './workflow-env-policy.mts'
import { makeRepoFixture } from '../test-helpers/config-inventory/repo-fixture.mts'

describe('collectConfigInventory shared reader', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('uses the shared reader and skips the generated PostgreSQL snapshot', async () => {
    const files = {
      'backend/config/example.mts': 'process.env.SHARED_READER_ENV\n',
      'backend/data-stores/psql/schema-snapshot/schema.json':
        '{"generated":"process.env.GENERATED_ARTIFACT_ENV"}',
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

  it('retains the documented no-ECR AWS test-role contract for image publishers', async () => {
    const ctx = await buildSharedContext(process.cwd())
    const inventory = await collectConfigInventory(ctx)
    const role = inventory.envVars.find(row => row.name === 'AWS_TEST_ROLE_ARN')

    expect(role).toEqual(
      expect.objectContaining({
        docs: expect.arrayContaining(['docs/development/reference-ci-ci-job-conditions.md']),
        workflows: expect.arrayContaining([
          '.github/workflows/publish-backend-images.yml',
          '.github/workflows/publish-web-images.yml',
        ]),
      }),
    )
    expect(
      checkWorkflowEnvReferences(ctx, inventory).filter(error =>
        error.includes('AWS_TEST_ROLE_ARN'),
      ),
    ).toEqual([])
  })
})
