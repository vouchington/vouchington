import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stableStringify } from '@modules/utils/stable-stringify'
import { writeGeneratedFiles } from 'vouchington-tooling/api-fixtures'

import { apiFixtureCases } from './cases.mts'
import { validateFixtureContracts } from './fixture-contract-validation.mts'
import { loadBackendResponseContracts } from './response-contract-registry.mts'
import { buildApiFixtureSchemaLock, responseSchemaFor } from './schema-lock.mts'
import type { ApiFixtureManifest } from './types.mts'

export { stableStringify } from '@modules/utils/stable-stringify'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const fixtureRoot = join(repoRoot, 'api-fixtures/v1')
const responsesRoot = join(fixtureRoot, 'responses')
const manifestPath = join(fixtureRoot, 'manifest.json')
const schemaLockPath = join(fixtureRoot, 'schema-lock.json')

function bodyFileFor(id: string): string {
  return `responses/${id}.json`
}

export function buildApiFixtureManifest(): ApiFixtureManifest {
  const requestedContractKeys = new Set(
    apiFixtureCases.map(fixtureCase => fixtureCase.backendResponseContractKey),
  )
  const backendResponseContracts = loadBackendResponseContracts(requestedContractKeys)
  validateFixtureContracts(apiFixtureCases, backendResponseContracts)
  return {
    version: 2,
    source: {
      kind: 'generated',
      generator: 'backend/test-helpers/api-fixtures/generate.mts',
      caseRoot: 'backend/test-helpers/api-fixtures',
    },
    backendResponseContracts,
    fixtures: apiFixtureCases.map(({ body, responseSchemaKey, ...fixtureCase }) => ({
      ...fixtureCase,
      bodyFile: bodyFileFor(fixtureCase.id),
      responseSchema: responseSchemaFor(fixtureCase.id, responseSchemaKey, body),
    })),
  }
}

function fixtureFiles(): Map<string, string> {
  const files = new Map<string, string>()
  const manifest = buildApiFixtureManifest()
  files.set(manifestPath, stableStringify(manifest))
  files.set(
    schemaLockPath,
    stableStringify(buildApiFixtureSchemaLock(manifest.backendResponseContracts)),
  )

  for (const fixtureCase of apiFixtureCases) {
    files.set(join(responsesRoot, `${fixtureCase.id}.json`), stableStringify(fixtureCase.body))
  }

  return files
}

export async function writeApiFixtures({
  check = false,
}: {
  check?: boolean
} = {}): Promise<void> {
  await writeGeneratedFiles({
    files: fixtureFiles(),
    check,
    obsoleteDirectory: responsesRoot,
    staleError: paths =>
      new Error(
        [
          'api-fixtures are stale. Run `pnpm run api-fixtures:generate` and commit the changes.',
          ...paths.map(path => `- ${path}`),
        ].join('\n'),
      ),
  })
}
