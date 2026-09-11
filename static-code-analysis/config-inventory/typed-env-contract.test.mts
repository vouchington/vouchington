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
        'export const value = process.env[SHARED_TYPED_CONTRACT_CONST]\n',
      'backend/services/typed-contract/local-alias.mts':
        "const LOCAL_ALIAS_ENV = 'UNDECLARED_LOCAL_ALIAS_ENV'\nprocess.env[LOCAL_ALIAS_ENV]\n",
      'ts-shared/env-contract/index.mts': [
        'export function collectTypedEnvContractEntries() {',
        '  return [{',
        "    name: 'TYPED_CONTRACT_ENV',",
        "    contractKey: 'typed-contract',",
        "    sourceOfTruth: '@ts-shared/env-contract',",
        "    sensitivity: 'secret',",
        "    runtimeSurfaces: ['backend', 'worker'],",
        '  }]',
        '}',
        'export function collectTypedEnvVarConstants() {',
        '  return { SHARED_TYPED_CONTRACT_CONST: "TYPED_CONTRACT_ENV" }',
        '}',
      ].join('\n'),
    })

    const inventory = await collectConfigInventory(ctx)

    expect(inventory.envVars).toContainEqual(
      expect.objectContaining({
        name: 'TYPED_CONTRACT_ENV',
        contractKey: 'typed-contract',
        sourceOfTruth: '@ts-shared/env-contract',
        sensitivity: 'secret',
        runtimeSurfaces: ['backend', 'worker'],
        readers: ['backend/services/typed-contract/consumer.mts'],
      }),
    )
    expect(inventory.envVars).not.toContainEqual(
      expect.objectContaining({ name: 'UNDECLARED_LOCAL_ALIAS_ENV' }),
    )
  })

  it('fails when the typed contract entrypoint exists but cannot load', async () => {
    const ctx = await makeRepoFixture({
      'ts-shared/env-contract/index.mts': 'throw new Error("broken contract")\n',
    })

    await expect(collectConfigInventory(ctx)).rejects.toThrow('failed to load typed env contract')
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
