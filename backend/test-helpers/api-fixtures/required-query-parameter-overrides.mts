/**
 * The published query extractor currently omits requiredness for query parameters. Keep the
 * small, reviewed set of request-required query fields explicit until that extractor exposes it.
 */
export const REQUIRED_QUERY_PARAMETER_OVERRIDES: Readonly<Record<string, readonly string[]>> = {
  'GET:/api/v1/availability': ['kind', 'value'],
  'GET:/api/v1/localization': ['consumer'],
}

export function applyRequiredQueryParameterOverrides(document: {
  paths: Record<string, Record<string, { parameters?: Array<Record<string, unknown>> } | undefined>>
}): void {
  for (const [operationKey, names] of Object.entries(REQUIRED_QUERY_PARAMETER_OVERRIDES)) {
    const separator = operationKey.indexOf(':')
    const method = operationKey.slice(0, separator)
    const route = operationKey.slice(separator + 1)
    const operation = document.paths[route.replace(/:([^/]+)/gu, '{$1}')]?.[method.toLowerCase()]
    if (!operation) continue
    for (const name of names) {
      const parameter = operation.parameters?.find(
        candidate => candidate.in === 'query' && candidate.name === name,
      )
      if (!parameter)
        throw new Error(`Required query parameter ${operationKey} ${name} is unavailable`)
      parameter.required = true
    }
  }
}
