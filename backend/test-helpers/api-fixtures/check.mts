import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

import { routeShape } from 'vouchington-tooling/api-contract-discovery'

import { assertBackendRowContracts } from './backend-row-contracts.mts'
import { getBackendProgramBuildCount, loadBackendProgram } from './backend-program.mts'
import {
  loadBackendQueryContracts,
  loadBackendResponseContracts,
  loadBackendRequestContracts,
  loadBackendHeaderContracts,
  loadRegisteredRouteCatalog,
} from './backend-contract-catalog.mts'
import { buildOpenApiDocument } from './openapi/build-openapi-document.mts'
import { writeOpenApi } from './openapi/write-openapi.mts'
import { writeApiFixtures } from './write.mts'

const start = performance.now()
function reportPhase(name: string): void {
  console.log(`${name} after ${((performance.now() - start) / 1000).toFixed(2)}s`)
}

const loaded = loadBackendProgram()
reportPhase('Backend program ready')
assertBackendRowContracts(loaded.program)
reportPhase('PostgreSQL row contracts verified')
const builds = getBackendProgramBuildCount()

// Fixture validation and OpenAPI share one full discovery rather than extracting responses twice.
const discoveryOptions = { onRouteError: () => {} }
const responses = loadBackendResponseContracts(undefined, discoveryOptions)
const knownResponseRoutes = new Set(Object.keys(responses))
await writeApiFixtures({ check: true, responseContracts: responses })
reportPhase('Response fixtures verified')
const queries = loadBackendQueryContracts(knownResponseRoutes)
const document = buildOpenApiDocument(
  responses,
  loadBackendRequestContracts(undefined, discoveryOptions),
  queries,
  {
    headerContracts: loadBackendHeaderContracts(knownResponseRoutes),
    registeredRoutes: loadRegisteredRouteCatalog(),
  },
)
assert.deepEqual(document['x-unavailable-routes'], [])
assert.deepEqual(document['x-unavailable-request-routes'], [])
reportPhase('OpenAPI contracts extracted')

const registered = loadRegisteredRouteCatalog().map(
  route => `${route.method}:${routeShape(route.routeTemplate)}`,
)
const generated = Object.entries(document.paths).flatMap(([route, item]) =>
  Object.keys(item).map(method => `${method.toUpperCase()}:${route.replace(/\{[^/]+\}/g, ':')}`),
)
assert.deepEqual([...new Set(generated)].toSorted(), [...new Set(registered)].toSorted())

assert.deepEqual(queries['GET:/api/v1/topics/:id/prioritized-referral-links']?.parameters.all, {
  kind: 'boolean',
})
assert.deepEqual(queries['POST:/api/v1/rss-feeds/:id/refreshes']?.parameters.force, {
  kind: 'boolean',
})
assert.equal(queries['GET:/api/v1/topics/compare']?.parameters.slugs.kind, 'csv-array')
assert.equal(queries['GET:/api/v1/rss-feed-items']?.parameters.media_type.kind, 'csv-array')
const limit = queries['GET:/api/v1/referral-links']?.parameters.limit
assert.equal(limit?.kind, 'integer')
assert.equal(limit?.minimum, 1)
assert.equal(limit?.maximum, 100)
for (const [operation, name] of [
  ['GET:/api/v1/availability', 'kind'],
  ['GET:/api/v1/availability', 'value'],
  ['GET:/api/v1/localization', 'consumer'],
]) {
  const parameter = queries[operation]?.parameters[name]
  assert.ok(parameter && 'required' in parameter && parameter.required === true)
}
assert.throws(
  () => loadBackendQueryContracts(new Set()),
  /apiQuery references unknown response route/,
)

await writeOpenApi({ check: true, document })
reportPhase('OpenAPI and request snapshots verified')
assert.equal(
  getBackendProgramBuildCount(),
  builds,
  'Contract checks must share the settled program',
)
console.log(
  `Backend API contracts verified in ${((performance.now() - start) / 1000).toFixed(2)}s (${builds} program build(s))`,
)
