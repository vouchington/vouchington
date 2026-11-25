import {
  omitSchemaProperties,
  pickSchemaProperties,
  type JsonSchema,
} from '@vouchington/mcp-server/schema'
import { componentSchema } from './route-response-schema.mts'

/**
 * The named properties of a generated REST component, inlined. The post, story and thread read
 * tools return a leaner shape than their REST twins, but every field keeps the schema the REST
 * contract gives it, and each tool's test pins the picks to the generated OpenAPI document.
 */
export function pickProperties(
  component: string,
  keys: readonly string[],
): Record<string, JsonSchema> {
  return pickSchemaProperties(componentSchema(component), keys, component)
}

/**
 * Every property of a generated REST component except the `omitted` ones, inlined. Write tools
 * return the REST entity as is, minus what only the REST twin may send (the staff detail).
 */
export function omitProperties(
  component: string,
  omitted: readonly string[],
): Record<string, JsonSchema> {
  return omitSchemaProperties(componentSchema(component), omitted)
}
