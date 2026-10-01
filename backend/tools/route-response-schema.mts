import contracts from '@voucha/api-fixtures/v1/request-contracts.json' with { type: 'json' }
import type { ToolApiEndpoint, ToolOutputSchema } from './types.mts'

type JsonSchema = Record<string, unknown>
type Components = Record<string, JsonSchema>

const { components, responses } = contracts as unknown as {
  components: Components
  responses: Record<string, JsonSchema>
}

const COMPONENT_PREFIX = '#/components/schemas/'

/**
 * The response schema of a tool's REST twin, self-contained for MCP clients.
 *
 * It comes from the generated `request-contracts.json` (`pnpm run openapi:generate`), the same
 * compiler-extracted source as the REST route, so the tool cannot drift from it. A route without
 * a named 200 response type has no contract and fails loudly when the tool module loads.
 */
export function routeResponseSchema(endpoint: ToolApiEndpoint): ToolOutputSchema {
  return resolveRouteResponse(endpoint, responses, components)
}

/** `routeResponseSchema` over explicit contracts, so its failure modes are testable. */
export function resolveRouteResponse(
  { method, path }: ToolApiEndpoint,
  contracts: Record<string, JsonSchema>,
  source: Components,
): ToolOutputSchema {
  const key = `${method}:${path}`
  const response = contracts[key]
  if (!response) {
    throw new Error(
      `No generated response contract for ${key}. Give the route a named response type and run pnpm run openapi:generate.`,
    )
  }
  const schema = inlineSchemaReferences(response, source)
  if (schema['type'] !== 'object') {
    throw new Error(`The response contract for ${key} is not an object; MCP requires one.`)
  }
  return { ...schema, type: 'object' }
}

/**
 * Inlines every `#/components/schemas/*` reference so the result needs no document around it. A
 * component that refers back to itself stays a `$ref` into a root `$defs`, so recursive contracts
 * still terminate.
 */
export function inlineSchemaReferences(schema: JsonSchema, source: Components): JsonSchema {
  const defs: Components = {}
  const inlined = inline(schema, [], defs, source) as JsonSchema
  return Object.keys(defs).length > 0 ? { ...inlined, $defs: defs } : inlined
}

/** A property of an object schema, for a tool that reshapes the REST body into its own result. */
export function routePropertySchema(schema: ToolOutputSchema, property: string): JsonSchema {
  assertNestable(schema)
  const found = (schema['properties'] as Components | undefined)?.[property]
  if (!found) throw new Error(`The response contract has no "${property}" property.`)
  return found
}

/**
 * A named component of the generated contracts, for a section whose REST route declares its
 * response inline (no named response type, so no `routeResponseSchema`). The tool's test pins the
 * section to that route's documented schema.
 */
export function componentSchema(name: string): JsonSchema {
  const schema = inlineSchemaReferences({ $ref: `${COMPONENT_PREFIX}${name}` }, components)
  assertNestable(schema)
  return schema
}

function assertNestable(schema: JsonSchema): void {
  if (schema['$defs']) throw new Error('A recursive response contract cannot be nested.')
}

/** The `{ success: true, result }` envelope the list tools wrap around a REST body. */
export function successResultSchema(result: ToolOutputSchema): ToolOutputSchema {
  const { $defs, ...body } = result
  return {
    type: 'object',
    properties: { success: { const: true }, result: body },
    required: ['success', 'result'],
    additionalProperties: false,
    ...($defs ? { $defs } : {}),
  }
}

function inline(
  value: unknown,
  ancestors: string[],
  defs: Components,
  source: Components,
): unknown {
  if (Array.isArray(value)) return value.map(item => inline(item, ancestors, defs, source))
  if (!value || typeof value !== 'object') return value
  const { $ref, ...siblings } = value as JsonSchema
  const inlinedSiblings = Object.fromEntries(
    Object.entries(siblings).map(([keyword, child]) => [
      keyword,
      inline(child, ancestors, defs, source),
    ]),
  )
  if (typeof $ref !== 'string') return inlinedSiblings
  const name = $ref.startsWith(COMPONENT_PREFIX) ? $ref.slice(COMPONENT_PREFIX.length) : ''
  const target = source[name]
  if (!target) throw new Error(`Unresolvable response contract reference ${$ref}`)
  if (!ancestors.includes(name)) {
    const inlinedTarget = inline(target, [...ancestors, name], defs, source)
    return { ...(inlinedTarget as JsonSchema), ...inlinedSiblings }
  }
  if (!(name in defs)) {
    defs[name] = {}
    defs[name] = inline(target, [name], defs, source) as JsonSchema
  }
  return { ...inlinedSiblings, $ref: `#/$defs/${name}` }
}
