import { beforeAll, describe, expect, it } from 'vitest'

import type { OpenApiDocument } from 'vouchington-tooling/openapi-document'
import { COLD_OPENAPI_BUILD_TIMEOUT_MS } from '../api-fixtures/cold-build-budget.mts'
import { buildOpenApiDocument } from '../api-fixtures/openapi/build-openapi-document.mts'
import { buildRequestContractsBundle } from '../api-fixtures/openapi/request-contract-bundle.mts'
import {
  assertDeclaredCarrierFamiliesValidated,
  assertQueryCarrierCoverage,
} from './request-validation-route-carriers.mts'
import { discoverInlineUuidQueryAssertions } from './request-validation-route-specialized.mts'
import { discoverRuntimeValidatedOperations } from './request-validation-route-validation-catalog.mts'
import { discoverThirdPartyRoutes, routeKey } from './request-validation-route-catalog.mts'
import {
  discoverSourceInputOperations,
  discoverSourceQueryReads,
} from './request-validation-route-input-catalog.mts'

import {
  NO_INPUT_OPERATIONS,
  SPECIALIZED_INGRESS,
  SPECIALIZED_QUERY_INPUTS,
} from './request-validation-route-classifications.mts'

let document: OpenApiDocument
let runtimeValidated: Set<string>
let runtimeCarrierFamilies: Map<string, Set<string>>
let sourceQueryReads: Map<string, Set<string>>

describe('third-party route request validation inventory', () => {
  beforeAll(() => {
    document = buildOpenApiDocument()
    runtimeCarrierFamilies = new Map()
    runtimeValidated = discoverRuntimeValidatedOperations(runtimeCarrierFamilies)
    sourceQueryReads = discoverSourceQueryReads()
  }, COLD_OPENAPI_BUILD_TIMEOUT_MS)

  it('classifies every registered REST and MCP route exactly once', () => {
    const routes = discoverThirdPartyRoutes()
    const keys = routes.map(routeKey)
    const noInput = new Set(NO_INPUT_OPERATIONS)
    const specialized = new Set(Object.keys(SPECIALIZED_INGRESS))
    expect(new Set(keys).size).toBe(keys.length)
    expect([...runtimeValidated].filter(key => !keys.includes(key))).toEqual([])
    expect(runtimeValidated).not.toContain('GET:/api/v1/auth/oauth/providers')
    expect([...specialized].filter(key => !keys.includes(key))).toEqual([])
    expect([...noInput].filter(key => !keys.includes(key))).toEqual([])
    expect([...runtimeValidated].filter(key => specialized.has(key) || noInput.has(key))).toEqual(
      [],
    )
    expect([...specialized].filter(key => noInput.has(key))).toEqual([])

    const unclassified = keys.filter(
      key => !runtimeValidated.has(key) && !specialized.has(key) && !noInput.has(key),
    )
    const sourceInputs = discoverSourceInputOperations()
    expect(sourceInputs).toContain('GET:/api/v1/localization')
    expect([...sourceInputs].filter(key => noInput.has(key))).toEqual([])
    expect(
      [...sourceInputs].filter(key => !runtimeValidated.has(key) && !specialized.has(key)),
    ).toEqual([])
    const queryReaders = [...sourceQueryReads.keys()]
    const specializedQueryOperations = new Set(Object.keys(SPECIALIZED_QUERY_INPUTS))
    expect(queryReaders.filter(key => !runtimeCarrierFamilies.get(key)?.has('query'))).toEqual(
      queryReaders.filter(key => specializedQueryOperations.has(key)),
    )
    for (const [operation, keys] of Object.entries(SPECIALIZED_QUERY_INPUTS)) {
      expect(sourceQueryReads.get(operation)).toEqual(new Set(keys))
    }
    const bundle = buildRequestContractsBundle(document)
    expect(() =>
      assertQueryCarrierCoverage(
        sourceQueryReads,
        runtimeCarrierFamilies,
        bundle.operations,
        SPECIALIZED_QUERY_INPUTS,
      ),
    ).not.toThrow()
    expect(() =>
      assertDeclaredCarrierFamiliesValidated(
        runtimeValidated,
        runtimeCarrierFamilies,
        bundle.operations,
        SPECIALIZED_QUERY_INPUTS,
      ),
    ).not.toThrow()
    expect({
      carrierless: unclassified.filter(key => !bundle.operations[key]),
      carrierBearing: unclassified.filter(key => bundle.operations[key]),
    }).toEqual({ carrierless: [], carrierBearing: [] })
    expect(keys.toSorted()).toEqual([...runtimeValidated, ...specialized, ...noInput].toSorted())
  })

  it('keeps no-input entries free of generated request carriers', () => {
    const bundle = buildRequestContractsBundle(document)
    for (const operation of NO_INPUT_OPERATIONS) {
      expect(bundle.operations[operation]).toBeUndefined()
    }
  })

  it('keeps the specialized parser exclusions tied to focused boundary tests', async () => {
    const { access, readFile } = await import('node:fs/promises')
    for (const exclusion of Object.values(SPECIALIZED_INGRESS)) {
      expect(exclusion.parser).not.toBe('')
      const evidenceUrl = new URL(`../../../${exclusion.evidence}`, import.meta.url)
      await expect(access(evidenceUrl)).resolves.toBeUndefined()
      const evidence = await readFile(evidenceUrl, 'utf8')
      expect(evidence).toContain(exclusion.proof)
    }
  })

  it('keeps the SSE query exception tied to its inline UUID assertion', async () => {
    const operation = 'GET:/api/v1/users/:idOrSlug/data-request/stream'
    const route = discoverThirdPartyRoutes().filter(value => routeKey(value) === operation)
    expect(discoverInlineUuidQueryAssertions()).toContain(operation)
    expect(route).toHaveLength(1)
  })

  it('rejects newly consumed query keys absent from the generated carrier schema', () => {
    expect(() =>
      assertQueryCarrierCoverage(
        new Map([['GET:/api/v1/search', new Set(['term', 'new_filter'])]]),
        new Map([['GET:/api/v1/search', new Set(['query'])]]),
        { 'GET:/api/v1/search': { query: { properties: { term: { type: 'string' } } } } },
        {},
      ),
    ).toThrow(/reads undeclared query key new_filter/)
  })

  it('rejects declared path and body carriers omitted from runtime validation', () => {
    expect(() =>
      assertDeclaredCarrierFamiliesValidated(
        new Set(['GET:/api/v1/search']),
        new Map([['GET:/api/v1/search', new Set(['query'])]]),
        {
          'GET:/api/v1/search': {
            path: { properties: { id: { type: 'string' } } },
            query: { properties: { term: { type: 'string' } } },
            body: { properties: { input: { type: 'string' } } },
          },
        },
        {},
      ),
    ).toThrow(
      'GET:/api/v1/search has a generated path carrier without runtime validation\n' +
        'GET:/api/v1/search has a generated body carrier without runtime validation',
    )
  })
})
