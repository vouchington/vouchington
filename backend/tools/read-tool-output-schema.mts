import { componentSchema } from './route-response-schema.mts'
import type { ToolOutputSchema } from '@services/openai-agents/tool-types'

type JsonSchema = Record<string, unknown>

/**
 * The named properties of a generated REST component, inlined. The post, story and thread read
 * tools return a leaner shape than their REST twins, but every field keeps the schema the REST
 * contract gives it, and each tool's test pins the picks to the generated OpenAPI document.
 */
export function pickProperties(
  component: string,
  keys: readonly string[],
): Record<string, JsonSchema> {
  const properties = componentSchema(component)['properties'] as
    | Record<string, JsonSchema>
    | undefined
  return Object.fromEntries(
    keys.map(key => {
      const schema = properties?.[key]
      if (!schema) throw new Error(`The ${component} contract has no "${key}" property.`)
      return [key, schema]
    }),
  )
}

/** A closed object that requires every property it declares. */
export function closedObject(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

/**
 * The result of a read tool: its `found` fields next to `success: true`, or the
 * `{ success: false, error }` answer for a post or story the caller cannot read.
 */
export function foundOrNotFoundSchema(found: Record<string, JsonSchema>): ToolOutputSchema {
  return {
    type: 'object',
    oneOf: [
      closedObject({ success: { const: true }, ...found }),
      closedObject({ success: { const: false }, error: { type: 'string' } }),
    ],
  }
}
