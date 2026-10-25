import contracts from '@voucha/api-fixtures/v1/request-contracts.json' with { type: 'json' }
import type { ToolApiEndpoint, ToolOutputSchema } from '@services/openai-agents/tool-types'
import {
  inlineSchemaReferences,
  resolveRouteResponse,
  routePropertySchema,
  type JsonSchema,
  type SchemaComponents,
} from '@vouchington/mcp-server/schema'

const { components, responses } = contracts as unknown as {
  components: SchemaComponents
  responses: Record<string, JsonSchema>
}

const COMPONENT_PREFIX = '#/components/schemas/'

/**
 * The response schema of a tool's REST twin, self-contained for MCP clients.
 *
 * It comes from the canonical checked-in `request-contracts.json`. Update that contract together
 * with the REST route. A route without a named response schema fails loudly when the tool loads.
 */
export function routeResponseSchema(endpoint: ToolApiEndpoint): ToolOutputSchema {
  return resolveRouteResponse(endpoint, responses, components, {
    missingContractHint:
      'Update api-fixtures/v1/request-contracts.json with the current route schema.',
  })
}

/**
 * A named component of the generated contracts, for a section whose REST route declares its
 * response inline (no named response type, so no `routeResponseSchema`). The tool's test pins the
 * section to that route's documented schema.
 */
export function componentSchema(name: string): JsonSchema {
  const schema = inlineSchemaReferences({ $ref: `${COMPONENT_PREFIX}${name}` }, components)
  if (schema['$defs']) throw new Error('A recursive response contract cannot be nested.')
  return schema
}

/** One property of a named component, for a tool that keeps only part of an entity. */
export function componentPropertySchema(name: string, property: string): JsonSchema {
  return routePropertySchema(componentSchema(name) as ToolOutputSchema, property)
}
