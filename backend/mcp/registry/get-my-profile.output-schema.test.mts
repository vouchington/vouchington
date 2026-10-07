import { describe, expect, it } from 'vitest'
import getMyProfileTool from '../get-my-profile.mts'
type JsonSchema = Record<string, unknown>
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

  it('publishes a schema that needs no document around it', () => {
    expect(JSON.stringify(schema)).not.toContain('$ref')
  })
})
