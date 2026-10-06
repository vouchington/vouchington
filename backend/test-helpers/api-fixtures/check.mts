import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

import { routeShape } from 'vouchington-tooling/api-contract-discovery'

import { assertBackendRowContracts } from './backend-row-contracts.mts'
import { getBackendProgramBuildCount, loadBackendProgram } from './backend-program.mts'
import {
  loadBackendContractCatalog,
  loadBackendHeaderContracts,
  loadBackendQueryContracts,
} from './backend-contract-catalog.mts'
import { buildOpenApiDocument } from './openapi/build-openapi-document.mts'
import { writeRequestContracts } from './openapi/write-request-contracts.mts'
import { writeApiFixtures } from './write.mts'
import { assertContentRequestContractCoverage } from './openapi/content-request-contract-coverage.mts'
import { assertStaffRequestContractCoverage } from './openapi/staff-request-contract-coverage.mts'
import { assertModerationOperationsRequestContractCoverage } from './openapi/moderation-operations-request-contract-coverage.mts'

const start = performance.now()
async function phase<Value>(name: string, run: () => Value | Promise<Value>): Promise<Value> {
  const phaseStart = performance.now()
  console.log(`::group::${name}`)
  console.log(`${name} started after ${((phaseStart - start) / 1000).toFixed(2)}s`)
  try {
    return await run()
  } finally {
    console.log(
      `${name} finished in ${((performance.now() - phaseStart) / 1000).toFixed(2)}s; total ${((performance.now() - start) / 1000).toFixed(2)}s`,
    )
    console.log('::endgroup::')
  }
}

const loaded = await phase('Build backend program', () => loadBackendProgram())
await phase('Verify PostgreSQL row contracts', () => assertBackendRowContracts(loaded.program))
const builds = getBackendProgramBuildCount()
const catalog = await phase('Discover API contract catalog', () => loadBackendContractCatalog())
await phase('Verify response fixtures', () =>
  writeApiFixtures({ check: true, responseContracts: catalog.responses }),
)
const knownResponseRoutes = new Set(Object.keys(catalog.responses))
const { document, queries, headers } = await phase('Build runtime request schemas', () => {
  const queries = loadBackendQueryContracts(knownResponseRoutes)
  const headers = loadBackendHeaderContracts(knownResponseRoutes)
  const document = buildOpenApiDocument(catalog.responses, catalog.requests, queries, {
    headerContracts: headers,
    registeredRoutes: catalog.routes,
  })
  return { document, queries, headers }
})
assert.deepEqual(document['x-unavailable-routes'], [])
assert.deepEqual(document['x-unavailable-request-routes'], [])
assertContentRequestContractCoverage(document)
assertStaffRequestContractCoverage(document)
assertModerationOperationsRequestContractCoverage(document)

const registered = catalog.routes.map(route => `${route.method}:${routeShape(route.routeTemplate)}`)
const generated = Object.entries(document.paths).flatMap(([route, item]) =>
  Object.keys(item).map(method => `${method.toUpperCase()}:${route.replace(/\{[^/]+\}/g, ':')}`),
)
assert.deepEqual([...new Set(generated)].toSorted(), [...new Set(registered)].toSorted())

assert.equal(queries, catalog.queries, 'Query checks must reuse the discovered catalog')
assert.equal(headers, catalog.headers, 'Header checks must reuse the discovered catalog')
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

await phase('Verify runtime request snapshot', () =>
  writeRequestContracts({ check: true, document }),
)
assert.equal(
  getBackendProgramBuildCount(),
  builds,
  'Contract checks must share the settled program',
)
console.log(
  `Backend API contracts verified in ${((performance.now() - start) / 1000).toFixed(2)}s (${builds} program build(s))`,
)
