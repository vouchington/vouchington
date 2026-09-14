import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { collectConfigInventory } from './collect.mts'
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
})
