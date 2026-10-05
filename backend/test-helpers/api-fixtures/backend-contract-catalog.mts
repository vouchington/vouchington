import {
  discoverApiHeaderContracts,
  discoverApiQueryContracts,
  discoverApiRequestContracts,
  discoverApiResponseContracts,
  discoverAppRouteCtxContractsV1,
  discoverRegisteredRoutes,
  type DiscoverApiResponseContractsOptions,
  type RegisteredRoute,
} from 'vouchington-tooling/api-contract-discovery'

import {
  loadBackendProgram,
  type BackendProgram,
  type BackendProgramGeneration,
} from './backend-program.mts'
import { vouchaExtractOptions } from './contract-schema.mts'
import type { HeaderContractRegistry } from './header-contract-types.mts'
import { relativizeContractTree } from './program-paths.mts'
import { assertUniqueResponseAttribution } from './response-contract-ambiguous-attribution.mts'
import { hasCompleteOperationCoverage } from './catalog-operation-coverage.mts'
import { withRequiredQueryParameters } from './required-query-parameters.mts'
import type { BackendQueryContractRegistry } from './query-contract-types.mts'
import type { BackendRequestContract } from './request-contract-types.mts'
import type { BackendResponseContract } from './response-contract-types.mts'

export type { RegisteredRoute } from 'vouchington-tooling/api-contract-discovery'
export type { BackendRequestContract } from './request-contract-types.mts'
export type { BackendResponseContract } from './response-contract-types.mts'

type DiscoveryOptions = DiscoverApiResponseContractsOptions
type PublishedCatalog = ReturnType<typeof discoverAppRouteCtxContractsV1>
type BackendContractCatalog = Omit<
  PublishedCatalog,
  'responses' | 'requests' | 'queries' | 'headers'
> & {
  responses: Record<string, BackendResponseContract>
  requests: Record<string, BackendRequestContract>
  queries: BackendQueryContractRegistry
  headers: HeaderContractRegistry
}
type CacheEntry<Value> = { generation: BackendProgramGeneration; value: Value }

const catalogs = new Map<string, CacheEntry<BackendContractCatalog>>()
const responses = new Map<string, CacheEntry<Record<string, BackendResponseContract>>>()
const requests = new Map<string, CacheEntry<Record<string, BackendRequestContract>>>()
const queries = new Map<string, CacheEntry<BackendQueryContractRegistry>>()
const headers = new Map<string, CacheEntry<HeaderContractRegistry>>()
let routes: CacheEntry<RegisteredRoute[]> | undefined

export function loadBackendResponseContracts(
  requestedKeys?: ReadonlySet<string>,
  options?: DiscoveryOptions,
): Record<string, BackendResponseContract> {
  if (!requestedKeys) return loadBackendContractCatalog(options).responses
  return cached(responses, signature(requestedKeys, options), loaded =>
    relativizeContractTree(
      discoverAttributedResponses(loaded, requestedKeys, schemaOptions(options)),
    ),
  ) as Record<string, BackendResponseContract>
}

export function loadBackendRequestContracts(
  requestedKeys?: ReadonlySet<string>,
  options?: DiscoveryOptions,
): Record<string, BackendRequestContract> {
  if (!requestedKeys) return loadBackendContractCatalog(options).requests
  return cached(requests, signature(requestedKeys, options), loaded =>
    relativizeContractTree(
      discoverApiRequestContracts(
        loaded.program,
        loaded.routeFiles,
        requestedKeys,
        schemaOptions(options),
      ),
    ),
  ) as Record<string, BackendRequestContract>
}

export function loadBackendQueryContracts(
  knownResponseRoutes: ReadonlySet<string>,
): BackendQueryContractRegistry {
  return cached(queries, [...knownResponseRoutes].toSorted().join('\n'), loaded => {
    const shared = strictCatalogFor(loaded)?.queries
    if (shared && hasCompleteOperationCoverage(shared, knownResponseRoutes)) return shared
    return relativizeContractTree(
      withRequiredQueryParameters(
        discoverApiQueryContracts(loaded.program, loaded.routeFiles, knownResponseRoutes),
      ),
    )
  }) as BackendQueryContractRegistry
}

export function loadBackendHeaderContracts(
  knownResponseRoutes: ReadonlySet<string>,
): HeaderContractRegistry {
  return cached(headers, [...knownResponseRoutes].toSorted().join('\n'), loaded => {
    const shared = strictCatalogFor(loaded)?.headers
    if (shared && hasCompleteOperationCoverage(shared, knownResponseRoutes)) return shared
    return relativizeContractTree(
      discoverApiHeaderContracts(loaded.program, loaded.routeFiles, knownResponseRoutes),
    )
  }) as HeaderContractRegistry
}

export function loadRegisteredRouteCatalog(): RegisteredRoute[] {
  const loaded = loadBackendProgram()
  if (routes?.generation === loaded.generation) return routes.value
  const value =
    catalogFor(loaded)?.routes ??
    relativizeContractTree(discoverRegisteredRoutes(loaded.program, loaded.routeFiles))
  routes = { generation: loaded.generation, value }
  return value
}

export function loadBackendContractCatalog(options?: DiscoveryOptions): BackendContractCatalog {
  return cached(catalogs, signature(undefined, options), loaded => {
    assertUniqueResponseAttribution(loaded.program, loaded.routeFiles)
    const value = relativizeContractTree(
      discoverAppRouteCtxContractsV1({
        program: loaded.program,
        sourceFiles: loaded.routeFiles,
        options: schemaOptions(options),
      }),
    ) as BackendContractCatalog
    return {
      ...value,
      queries: withRequiredQueryParameters(value.queries),
    }
  })
}

function discoverAttributedResponses(
  loaded: BackendProgram,
  requestedKeys: ReadonlySet<string> | undefined,
  options: DiscoveryOptions,
) {
  assertUniqueResponseAttribution(loaded.program, loaded.routeFiles)
  return discoverApiResponseContracts(loaded.program, loaded.routeFiles, requestedKeys, options)
}

function catalogFor(loaded: BackendProgram): BackendContractCatalog | undefined {
  for (const entry of catalogs.values()) {
    if (entry.generation === loaded.generation) return entry.value
  }
  return undefined
}

function strictCatalogFor(loaded: BackendProgram): BackendContractCatalog | undefined {
  const entry = catalogs.get(signature(undefined, undefined))
  return entry?.generation === loaded.generation ? entry.value : undefined
}

function schemaOptions(options: DiscoveryOptions | undefined): DiscoveryOptions {
  return { ...vouchaExtractOptions, ...options }
}

function signature(
  requestedKeys: ReadonlySet<string> | undefined,
  options: DiscoveryOptions | undefined,
): string {
  return `${requestedKeys ? [...requestedKeys].toSorted().join('\n') : '*'}#${
    options?.onRouteError ? 'lenient' : 'strict'
  }`
}

function cached<Value>(
  store: Map<string, CacheEntry<Value>>,
  key: string,
  load: (loaded: BackendProgram) => Value,
): Value {
  const loaded = loadBackendProgram()
  const hit = store.get(key)
  if (hit?.generation === loaded.generation) return hit.value
  const value = load(loaded)
  store.set(key, { generation: loaded.generation, value })
  return value
}
