import { readFileSync } from 'node:fs'
import { inlineSchemaReferences } from '../tools/route-response-schema.mts'

type JsonSchema = Record<string, unknown>
type OpenApiDocument = {
  components: { schemas: Record<string, JsonSchema> }
  paths: Record<
    string,
    Record<
      string,
      { responses: Record<string, { content?: Record<string, { schema: JsonSchema }> }> }
    >
  >
}

const openApi = JSON.parse(
  readFileSync(new URL('../../api-fixtures/v1/openapi.json', import.meta.url), 'utf8'),
) as OpenApiDocument

/** The JSON body schema the generated OpenAPI document gives one response, with every `$ref` inlined. */
export function documentedResponseSchema(
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  status: string,
): JsonSchema {
  const schema =
    openApi.paths[path]?.[method]?.responses[status]?.content?.['application/json']?.schema
  if (!schema)
    throw new Error(`${method.toUpperCase()} ${path} ${status} documents no JSON response`)
  return inlineSchemaReferences(schema, openApi.components.schemas)
}

/** One property of the object a response documents. */
export function documentedResponseProperty(
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  status: string,
  property: string,
): unknown {
  const properties = documentedResponseSchema(method, path, status)['properties'] as
    | Record<string, unknown>
    | undefined
  if (!properties || !(property in properties))
    throw new Error(`${method.toUpperCase()} ${path} ${status} documents no ${property} property`)
  return properties[property]
}
