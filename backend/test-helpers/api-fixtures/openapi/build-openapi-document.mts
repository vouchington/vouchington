import {
  buildOpenApiDocument as buildFromTooling,
  type QueryOperationContract,
  type RegisteredRoute as ToolingRegisteredRoute,
  type RequestContract,
  type ResponseContract,
  type OpenApiDocument,
} from 'vouchington-tooling/openapi-document'
import { loadBackendRequestContracts } from '../request-contract-registry.mts'
import type { BackendRequestContract } from '../request-contract-types.mts'
import { loadBackendQueryContracts } from '../query-contract-registry.mts'
import type { BackendQueryContractRegistry } from '../query-contract-types.mts'
import { loadBackendHeaderContracts } from '../header-contract-registry.mts'
import type { HeaderContractRegistry } from '../header-contract-types.mts'
import { loadBackendResponseContracts } from '../response-contract-registry.mts'
import type { BackendResponseContract } from '../response-contract-types.mts'
import { loadRegisteredRouteCatalog, type RegisteredRoute } from '../registered-route-catalog.mts'
import { applyMoneyContracts } from './openapi-money-contract.mts'

export function buildOpenApiDocument(
  contracts?: Record<string, BackendResponseContract>,
  requestContracts?: Record<string, BackendRequestContract>,
  queryContracts?: BackendQueryContractRegistry,
  options?: {
    headerContracts?: HeaderContractRegistry
    registeredRoutes?: readonly RegisteredRoute[]
  },
): OpenApiDocument {
  const loadRealQueryContracts = contracts === undefined
  const resolvedContracts =
    contracts ?? loadBackendResponseContracts(undefined, { onRouteError: () => {} })
  const resolvedRequestContracts =
    requestContracts ?? loadBackendRequestContracts(undefined, { onRouteError: () => {} })
  const resolvedQueryContracts =
    queryContracts ??
    (loadRealQueryContracts
      ? loadBackendQueryContracts(new Set(Object.keys(resolvedContracts)))
      : {})
  const registeredRoutes =
    options?.registeredRoutes ?? (contracts === undefined ? loadRegisteredRouteCatalog() : [])
  const document = buildFromTooling({
    title: 'Voucha API',
    version: '1.0.0',
    responseContracts: resolvedContracts as Record<string, ResponseContract>,
    requestContracts: resolvedRequestContracts as Record<string, RequestContract>,
    queryContracts: resolvedQueryContracts as Readonly<Record<string, QueryOperationContract>>,
    registeredRoutes: registeredRoutes as readonly ToolingRegisteredRoute[],
  })
  const headerContracts =
    options?.headerContracts ??
    (contracts === undefined
      ? loadBackendHeaderContracts(new Set(Object.keys(resolvedContracts)))
      : {})
  applyHeaderContracts(document, headerContracts)
  applyMoneyContracts(document)
  return document
}

function applyHeaderContracts(document: OpenApiDocument, contracts: HeaderContractRegistry): void {
  for (const [key, contract] of Object.entries(contracts)) {
    const separator = key.indexOf(':')
    const method = key.slice(0, separator)
    const route = key.slice(separator + 1)
    const operation = document.paths[route.replace(/:([^/]+)/g, '{$1}')]?.[method.toLowerCase()]
    if (!operation) throw new Error(`apiHeaders references unavailable OpenAPI operation ${key}`)
    const parameters = (operation.parameters ??= []) as Array<Record<string, unknown>>
    for (const [name, header] of Object.entries(contract.requestHeaders)) {
      parameters.push({
        name,
        in: 'header',
        required: header.required,
        ...(header.description ? { description: header.description } : {}),
        schema: { type: header.type, ...(header.format ? { format: header.format } : {}) },
      })
    }
    for (const [status, responseContract] of Object.entries(contract.responseHeaders)) {
      const response = (operation.responses[String(status)] ??= {
        description:
          status === '409' ? 'Conflict' : status === '429' ? 'Too Many Requests' : 'Error',
      }) as Record<string, unknown>
      if (responseContract.description) response.description = responseContract.description
      if (Object.keys(responseContract.headers).length > 0) {
        response.headers = Object.fromEntries(
          Object.entries(responseContract.headers).map(([name, header]) => [
            name,
            {
              ...(header.description ? { description: header.description } : {}),
              required: header.required,
              schema: { type: header.type, ...(header.format ? { format: header.format } : {}) },
            },
          ]),
        )
      }
      if (responseContract.errors) {
        response.content = {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorBody' },
            examples: Object.fromEntries(
              responseContract.errors.map(error => [error.code, { value: error }]),
            ),
          },
        }
      }
    }
  }
}
