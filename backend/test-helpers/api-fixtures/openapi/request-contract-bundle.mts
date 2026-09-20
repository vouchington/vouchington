import type { OpenApiDocument } from 'vouchington-tooling/openapi-document'

/** Runtime schema data has the same compiler extraction source as OpenAPI, but no OpenAPI data. */
export function buildRequestContractsBundle(document: OpenApiDocument) {
  const operations: Record<string, unknown> = {}
  for (const [route, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!['delete', 'get', 'patch', 'post', 'put'].includes(method)) continue
      if (!operation || typeof operation !== 'object') continue
      const requestBody = (operation as { requestBody?: unknown }).requestBody
      const content =
        requestBody && typeof requestBody === 'object'
          ? (requestBody as { content?: Record<string, unknown> }).content
          : undefined
      const json = content?.['application/json'] as { schema?: unknown } | undefined
      const parameters = (operation as { parameters?: unknown }).parameters
      const parameterSchemas = collectParameterSchemas(parameters)
      if (!json?.schema && Object.keys(parameterSchemas).length === 0) continue
      operations[`${method.toUpperCase()}:${route.replace(/\{([^}]+)\}/g, ':$1')}`] = {
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
  }
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
    const target = (grouped[carrier] ??= { type: 'object', properties: {}, required: [] })
    // Node's IncomingHttpHeaders normalizes field names to lowercase. Keep the generated
    // contract aligned with the runtime carrier instead of preserving documentation casing.
    const propertyName = carrier === 'header' ? name.toLowerCase() : name
    ;(target.properties as Record<string, unknown>)[propertyName] = schema
    if (required === true) (target.required as string[]).push(propertyName)
  }
  for (const target of Object.values(grouped)) {
    if ((target.required as string[]).length === 0) delete target.required
  }
  return grouped
}
