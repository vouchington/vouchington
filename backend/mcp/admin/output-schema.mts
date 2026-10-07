import contracts from '@voucha/api-fixtures/v1/request-contracts.json' with { type: 'json' }
import { inlineSchemaReferences } from '../route-response-schema.mts'
import type { ToolApiEndpoint, ToolOutputSchema } from '@services/openai-agents/tool-types'

/** Mirrors checked-in staff projections, including routes with an inline response body. */
export function adminRouteOutputSchema(
  endpoint: ToolApiEndpoint,
  projection?: string,
): ToolOutputSchema {
  const key = `${endpoint.method}:${endpoint.path.replaceAll(/\{([^}]+)\}/g, ':$1')}${projection ? `#${projection}` : ''}`
  const components = contracts.components as Record<string, Record<string, unknown>>
  const named = (contracts.responses as Record<string, Record<string, unknown>>)[key]
  if (named) return objectRootSchema(inlineSchemaReferences(named, components), key)
  const responseKey = `${endpoint.method}:${endpoint.path.replaceAll(/\{([^}]+)\}/g, ':$1')}`
  const schema = (contracts.adminResponses as Record<string, Record<string, unknown>>)[responseKey]
  if (!schema) throw new Error(`No checked-in admin response for ${key}`)
  const inlined = inlineSchemaReferences(schema, components)
  return objectRootSchema(inlined, key)
}

function objectRootSchema(schema: Record<string, unknown>, key: string): ToolOutputSchema {
  const isObject = (value: Record<string, unknown>): boolean => {
    if (value['type'] === 'object') return true
    for (const union of ['anyOf', 'oneOf']) {
      const branches = value[union]
      if (
        Array.isArray(branches) &&
        branches.length > 0 &&
        branches.every(branch => isObject(branch as Record<string, unknown>))
      )
        return true
    }
    const intersection = value['allOf']
    return (
      Array.isArray(intersection) &&
      intersection.some(branch => isObject(branch as Record<string, unknown>))
    )
  }
  if (!isObject(schema)) throw new Error(`Admin response for ${key} must be an object`)
  return { ...schema, type: 'object' } as ToolOutputSchema
}
