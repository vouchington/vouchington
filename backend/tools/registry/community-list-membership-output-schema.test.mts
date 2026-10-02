import {
  documentedResponseProperty,
  documentedResponseSchema,
} from '@voucha/test-helpers/openapi-documented-response'
import { describe, expect, it } from 'vitest'
import { COMMUNITY_LIST_ITEM_TYPES } from '../mcp-community-list-item-output.mts'
import getCommunityListItemCountsTool from '../get-community-list-item-counts.mts'
import getMembershipPlansTool from '../get-membership-plans.mts'
import getMyListsContainingTool from '../get-my-lists-containing.mts'

type JsonSchema = Record<string, unknown>

const properties = (schema: unknown): Record<string, unknown> =>
  (schema as JsonSchema)['properties'] as Record<string, unknown>
// A read tool pairs its success body with a not-found answer in `oneOf`; a plain body is its own.
const success = (schema: unknown): JsonSchema =>
  ((schema as { oneOf?: JsonSchema[] }).oneOf ?? [schema as JsonSchema]).find(
    branch =>
      'products' in properties(branch) ||
      'list_ids' in properties(branch) ||
      'topic' in properties(branch),
  )!

// These routes document their bodies, so the tools must keep the schema the OpenAPI document
// gives the same fields rather than describing them a second time.
describe('community list, list membership and plan tool output schemas stay pinned to the documented REST twins', () => {
  it('takes the plans result from the documented plans body', () => {
    const result = properties(success(getMembershipPlansTool.meta?.outputSchema))

    for (const property of ['products', 'benefit_catalog']) {
      expect(result[property]).toEqual(
        documentedResponseProperty('get', '/api/v1/memberships/plans', '200', property),
      )
    }
  })

  it('takes list_ids from the documented contains body', () => {
    const result = properties(success(getMyListsContainingTool.meta?.outputSchema))

    expect(result['list_ids']).toEqual(
      documentedResponseProperty('get', '/api/v1/lists/contains', '200', 'list_ids'),
    )
  })

  it('takes each count from the documented counts body', () => {
    const documented = properties(
      documentedResponseSchema('get', '/api/v1/communities/{idOrSlug}/list-items/counts', '200'),
    )
    const result = properties(success(getCommunityListItemCountsTool.meta?.outputSchema))

    for (const itemType of COMMUNITY_LIST_ITEM_TYPES) {
      expect(result[itemType]).toEqual(documented[itemType])
    }
  })
})
