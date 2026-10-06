import { buildAdminResponseContracts } from './admin-response-contracts.mts'
import type { OpenApiDocument } from 'vouchington-tooling/openapi-document'

const OPERATION_METHODS = ['delete', 'get', 'patch', 'post', 'put']

const operationKey = (method: string, route: string): string =>
  `${method.toUpperCase()}:${route.replace(/\{([^}]+)\}/g, ':$1')}`

/** Runtime schema data has the same compiler extraction source as OpenAPI, but no OpenAPI data. */
export function buildRequestContractsBundle(document: OpenApiDocument) {
  const operations: Record<string, unknown> = {}
  const responses: Record<string, unknown> = {}
  for (const [route, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!OPERATION_METHODS.includes(method)) continue
      if (!operation || typeof operation !== 'object') continue
      const response = namedResponseSchema(operation)
      if (response) responses[operationKey(method, route)] = response
      const requestBody = (operation as { requestBody?: unknown }).requestBody
      const content =
        requestBody && typeof requestBody === 'object'
          ? (requestBody as { content?: Record<string, unknown> }).content
          : undefined
      const json = content?.['application/json'] as { schema?: unknown } | undefined
      const parameters = (operation as { parameters?: unknown }).parameters
      const parameterSchemas = collectParameterSchemas(parameters)
      if (!json?.schema && Object.keys(parameterSchemas).length === 0) continue
      operations[operationKey(method, route)] = {
        ...(json?.schema ? { body: json.schema } : {}),
        ...parameterSchemas,
      }
    }
  }
  return {
    version: 1 as const,
    source: 'compiler-extracted-request-contracts' as const,
    components: document.components.schemas,
    operations,
    responses,
    adminResponses: buildAdminResponseContracts(document),
  }
}

/**
 * The 200 JSON response, only when it is a reference to a named component. Runtime consumers (MCP
 * tool output schemas) resolve the reference against `components`, so the bundle stays small
 * instead of repeating every inline response body. `responses` is a sibling of `operations`, never
 * a field of it: an operation entry makes the request validator treat a route as contract-covered.
 */
function namedResponseSchema(operation: object): { $ref: string } | null {
  const responses = (operation as { responses?: Record<string, unknown> }).responses
  const ok = responses?.['200'] as
    | { content?: Record<string, { schema?: Record<string, unknown> } | undefined> }
    | undefined
  const schema = ok?.content?.['application/json']?.schema
  if (!schema || Object.keys(schema).length !== 1 || typeof schema['$ref'] !== 'string') return null
  return { $ref: schema['$ref'] }
}

function collectParameterSchemas(parameters: unknown): Record<string, unknown> {
  const grouped: Record<string, Record<string, unknown>> = {}
  if (!Array.isArray(parameters)) return grouped
  for (const parameter of parameters) {
    if (!parameter || typeof parameter !== 'object') continue
    const { in: carrier, name, required, schema } = parameter as Record<string, unknown>
    if (
      (carrier !== 'header' && carrier !== 'path' && carrier !== 'query') ||
      typeof name !== 'string'
    ) {
      continue
    }
    if (!schema || typeof schema !== 'object') continue
    let target = grouped[carrier]
    if (!target) {
      target = { type: 'object', properties: {}, required: [] }
      grouped[carrier] = target
    }
    // Node's IncomingHttpHeaders normalizes field names to lowercase. Keep the generated
    // contract aligned with the runtime carrier instead of preserving documentation casing.
    const propertyName = carrier === 'header' ? name.toLowerCase() : name
    ;(target.properties as Record<string, unknown>)[propertyName] = schema
    if (required === true) (target.required as string[]).push(propertyName)
  }
  return Object.fromEntries(
    Object.entries(grouped).map(([carrier, target]) => {
      const required = target.required as string[]
      if (required.length > 0) return [carrier, target]
      const { required: _required, ...optionalTarget } = target
      return [carrier, optionalTarget]
    }),
  )
}
