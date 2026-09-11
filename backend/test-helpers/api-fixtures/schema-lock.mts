import {
  buildFixtureSchemaLock,
  responseSchemaFor as responseSchemaForFromTooling,
  type FixtureSchemaLock,
} from 'vouchington-tooling/api-fixtures'

import { apiFixtureCases } from './cases.mts'
import {
  loadBackendResponseContracts,
  type BackendResponseContract,
} from './response-contract-registry.mts'

export type ApiFixtureSchemaLock = FixtureSchemaLock

const DISCRIMINATOR_KEYS = new Set([
  '__entity_type',
  'entity_type',
  'feed_type',
  'post_type',
  'topic_type',
  'type',
])

export function responseSchemaFor(id: string, key: string | undefined, body: unknown) {
  return responseSchemaForFromTooling(id, key, body, DISCRIMINATOR_KEYS)
}

export function buildApiFixtureSchemaLock(
  backendContracts: Record<string, BackendResponseContract> = loadBackendResponseContracts(
    new Set(apiFixtureCases.map(fixtureCase => fixtureCase.backendResponseContractKey)),
  ),
): ApiFixtureSchemaLock {
  return buildFixtureSchemaLock({
    cases: apiFixtureCases.map(fixtureCase => ({
      id: fixtureCase.id,
      responseSchemaKey: fixtureCase.responseSchemaKey,
      body: fixtureCase.body,
      backendResponseContractKey: fixtureCase.backendResponseContractKey,
    })),
    backendContracts: Object.fromEntries(
      Object.entries(backendContracts).map(([key, contract]) => [key, { hash: contract.hash }]),
    ),
    discriminatorKeys: DISCRIMINATOR_KEYS,
    source: {
      kind: 'generated',
      generator: 'backend/test-helpers/api-fixtures/generate.mts',
      caseRoot: 'backend/test-helpers/api-fixtures',
    },
  })
}
