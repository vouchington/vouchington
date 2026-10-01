import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import getMyProfileTool from './get-my-profile.mts'
import { inlineSchemaReferences } from './route-response-schema.mts'

type JsonSchema = Record<string, unknown>
type OpenApi = {
  components: { schemas: Record<string, JsonSchema> }
  paths: Record<
    string,
    { get: { responses: { 200: { content: Record<string, { schema: JsonSchema }> } } } }
  >
}

const openApi = JSON.parse(
  readFileSync(new URL('../../api-fixtures/v1/openapi.json', import.meta.url), 'utf8'),
) as OpenApi

// get_my_profile flattens three REST bodies into one result, so it owns its result schema. Each
// section must stay the schema its REST twin documents in the generated OpenAPI document.
function documentedBody(path: string): JsonSchema {
  const schema = openApi.paths[path]?.get.responses[200].content['application/json']?.schema
  if (!schema) throw new Error(`${path} documents no JSON response`)
  return inlineSchemaReferences(schema, openApi.components.schemas)
}

function documentedProperty(path: string, property: string): unknown {
  return (documentedBody(path)['properties'] as Record<string, unknown>)[property]
}

describe('get_my_profile output schema', () => {
  const schema = getMyProfileTool.meta?.outputSchema as JsonSchema
  const properties = schema['properties'] as Record<string, unknown>

  it('is a closed object that requires every section', () => {
    expect(schema['type']).toBe('object')
    expect(schema['additionalProperties']).toBe(false)
    expect(schema['required']).toEqual(Object.keys(properties))
    expect(Object.keys(properties)).toEqual([
      'success',
      'cards',
      'cards_page_info',
      'point_valuations',
      'point_valuations_page_info',
      'rewards_program_statuses',
      'rewards_program_statuses_page_info',
    ])
  })

  it.each([
    ['cards', 'cards_page_info', '/api/v1/my/cards'],
    [
      'point_valuations',
      'point_valuations_page_info',
      '/api/v1/my/rewards-program-point-valuations',
    ],
    [
      'rewards_program_statuses',
      'rewards_program_statuses_page_info',
      '/api/v1/my/rewards-program-statuses',
    ],
  ])('takes %s and its page info from the %s REST twin', (list, pageInfo, path) => {
    expect(properties[list]).toEqual(documentedProperty(path, 'results'))
    expect(properties[pageInfo]).toEqual(documentedProperty(path, 'page_info'))
  })

  it('publishes a schema that needs no document around it', () => {
    expect(JSON.stringify(schema)).not.toContain('$ref')
  })
})
