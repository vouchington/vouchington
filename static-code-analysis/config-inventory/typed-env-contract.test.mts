import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { collectConfigInventory } from './index.mts'
import type { SharedContext } from 'vouchington-tooling/shared-context'

describe('typed env contract integration', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('loads typed contract metadata and constant indirection from ts-shared/env-contract', async () => {
    const ctx = await makeRepoFixture({
      'backend/services/typed-contract/consumer.mts':
        'export const value = process.env[HASH_ENV]\n',
      'backend/services/typed-contract/local-alias.mts':
        "const LOCAL_ALIAS_ENV = 'UNDECLARED_LOCAL_ALIAS_ENV'\nprocess.env[LOCAL_ALIAS_ENV]\n",
    })

    const inventory = await collectConfigInventory(ctx)

    expect(inventory.envVars).toContainEqual(
      expect.objectContaining({
        name: 'VOUCHA_OTP_TOKEN_HASH_SECRET',
        contractKey:
          'vouchington-infra:ecs-backend-secret+ecs-worker-secret:VOUCHA_OTP_TOKEN_HASH_SECRET',
        sourceOfTruth: 'vouchington-infra',
        sensitivity: 'secret',
        runtimeSurfaces: ['ecs-backend-secret', 'ecs-worker-secret'],
        readers: ['backend/services/typed-contract/consumer.mts'],
      }),
    )
    expect(inventory.envVars).not.toContainEqual(
      expect.objectContaining({ name: 'UNDECLARED_LOCAL_ALIAS_ENV' }),
    )
  })

  async function makeRepoFixture(files: Record<string, string>): Promise<SharedContext> {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-config-typed-contract-'))
    testDirs.push(dir)
    const trackedFiles = Object.keys(files)
    for (const [file, content] of Object.entries(files)) {
      await mkdir(join(dir, file, '..'), { recursive: true })
      await writeFile(join(dir, file), content)
    }
    return {
      repoRoot: dir,
      isInsideGitRepo: true,
      trackedFiles,
      trackedFileSet: new Set(trackedFiles),
    }
  }
})
