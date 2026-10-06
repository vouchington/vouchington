import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stableStringify } from '@modules/utils/stable-stringify'
import { writeGeneratedFiles } from 'vouchington-tooling/api-fixtures'
import { routeShape, type BackendResponseContract } from './response-contract-types.mts'

import { apiFixtureCases } from './cases.mts'
import { validateFixtureContracts } from './fixture-contract-validation.mts'
import { backendResponseContracts as canonicalResponseContracts } from './response-contracts.mts'
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

export function buildApiFixtureManifest(
  responseContracts?: Record<string, BackendResponseContract>,
): ApiFixtureManifest {
  const requestedContractKeys = new Set(
    apiFixtureCases.map(fixtureCase => fixtureCase.backendResponseContractKey),
  )
  const backendResponseContracts = responseContracts
    ? selectFixtureContracts(responseContracts, requestedContractKeys)
    : selectFixtureContracts(canonicalResponseContracts, requestedContractKeys)
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

function selectFixtureContracts(
  contracts: Record<string, BackendResponseContract>,
  requestedKeys: ReadonlySet<string>,
): Record<string, BackendResponseContract> {
  const byShape = new Map<string, BackendResponseContract>()
  for (const [key, contract] of Object.entries(contracts)) {
    const shape = contractKeyShape(key)
    assert(!byShape.has(shape), `Ambiguous response contract route shape: ${shape}`)
    byShape.set(shape, contract)
  }
  const selected: Record<string, BackendResponseContract> = {}
  for (const key of requestedKeys) {
    const contract = contracts[key] ?? byShape.get(contractKeyShape(key))
    if (contract) selected[key] = contract
  }
  // Explicit raw-body contracts remain even without a JSON fixture.
  for (const [key, contract] of Object.entries(contracts)) {
    const root = contract.schema.root
    if (root.type === 'string' && root.format === 'binary') selected[key] = contract
  }
  return selected
}

function contractKeyShape(key: string): string {
  const separator = key.indexOf(':')
  const variant = key.indexOf('#')
  const end = variant < 0 ? key.length : variant
  return `${key.slice(0, separator)}:${routeShape(key.slice(separator + 1, end))}${key.slice(end)}`
}

function fixtureFiles(
  responseContracts?: Record<string, BackendResponseContract>,
): Map<string, string> {
  const files = new Map<string, string>()
  const manifest = buildApiFixtureManifest(responseContracts)
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
  responseContracts,
}: {
  check?: boolean
  responseContracts?: Record<string, BackendResponseContract>
} = {}): Promise<void> {
  await writeGeneratedFiles({
    files: fixtureFiles(responseContracts),
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
