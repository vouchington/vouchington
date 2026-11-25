import contracts from '@voucha/api-contracts/v1/request-contracts.json' with { type: 'json' }
import {
  resolveRouteResponse,
  type JsonSchema,
  type SchemaComponents,
} from '@vouchington/mcp-server/schema'
import type { ToolApiEndpoint, ToolOutputSchema } from '@vouchington/mcp-server/types'

const { adminResponses, components, responses } = contracts as unknown as {
  adminResponses: Record<string, JsonSchema>
  components: SchemaComponents
  responses: Record<string, JsonSchema>
}

/** Mirrors checked-in staff projections, including routes with an inline response body. */
export function adminRouteOutputSchema(
  endpoint: ToolApiEndpoint,
  projection?: string,
): ToolOutputSchema {
  return resolveRouteResponse(endpoint, responses, components, {
    projection,
    fallbackResponses: adminResponses,
    normalizePathParams: true,
  })
}
