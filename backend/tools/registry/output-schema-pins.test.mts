import {
  documentedResponseProperty,
  documentedResponseSchema,
} from '@voucha/test-helpers/openapi-documented-response'
import { describe, expect, it } from 'vitest'
import getReferralLinksTool from '../get-referral-links.mts'
import getTopicDetailsTool from '../get-topic-details.mts'
import manageMyCardsTool from '../manage-my-cards.mts'
import manageMyPointValuationsTool from '../manage-my-point-valuations.mts'
import manageMyRewardsStatusesTool from '../manage-my-rewards-statuses.mts'
import manageMySpendingTool from '../manage-my-spending.mts'
import updateMyFinancialProfileTool from '../update-my-financial-profile.mts'

type JsonSchema = Record<string, unknown>

const properties = (schema: unknown): Record<string, unknown> =>
  (schema as JsonSchema)['properties'] as Record<string, unknown>

// These tools reshape their REST twins, so each owns its output schema. Wherever the generated
// OpenAPI document describes the same data, the tool must keep the schema the document gives it.
describe('tool-owned output schemas stay pinned to the documented REST twins', () => {
  it.each([
    [manageMyCardsTool, '/api/v1/my/cards', '/api/v1/my/cards/{id}', 'card'],
    [
      manageMyPointValuationsTool,
      '/api/v1/my/rewards-program-point-valuations',
      '/api/v1/my/rewards-program-point-valuations/{id}',
      'point_valuation',
    ],
    [
      manageMyRewardsStatusesTool,
      '/api/v1/my/rewards-program-statuses',
      '/api/v1/my/rewards-program-statuses/{id}',
      'rewards_program_status',
    ],
    [
      manageMySpendingTool,
      '/api/v1/my/spending-categories',
      '/api/v1/my/spending-categories/{id}',
      'spending_category',
    ],
  ])(
    'takes the %# stored row from the created and updated REST bodies',
    (tool, create, update, key) => {
      const result = properties(tool.meta?.outputSchema)['result'] as {
        oneOf: [JsonSchema, JsonSchema]
      }
      const [row, removed] = result.oneOf

      expect(row).toEqual(documentedResponseProperty('post', create, '201', key))
      expect(row).toEqual(documentedResponseProperty('patch', update, '200', key))
      expect(removed).toMatchObject({ required: ['id'], additionalProperties: false })
    },
  )

  it('takes the profile fields from the stored financial profile the PUT route returns', () => {
    const profile = properties(updateMyFinancialProfileTool.meta?.outputSchema)['profile']
    const documented = properties(
      documentedResponseProperty('put', '/api/v1/my/financial-profile', '200', 'financial_profile'),
    )

    expect(Object.keys(properties(profile)).toSorted()).toEqual([
      'credit_score_range',
      'currency',
      'stated_income_range',
      'total_credit_limit',
      'years_of_credit_history',
    ])
    for (const [field, schema] of Object.entries(properties(profile))) {
      expect(schema).toEqual(documented[field])
    }
  })

  it('takes children_page_info from the PageInfo the documented posts route returns', () => {
    const schema = getTopicDetailsTool.meta?.outputSchema as unknown as { oneOf: JsonSchema[] }
    const documented = documentedResponseProperty('get', '/api/v1/posts', '200', 'page_info') as {
      anyOf: JsonSchema[]
    }

    expect(properties(schema.oneOf[0])['children_page_info']).toEqual(documented.anyOf[0])
    expect(schema.oneOf[0]).toMatchObject({
      required: expect.not.arrayContaining(['parents', 'children', 'children_page_info']),
    })
  })

  it('takes the shared link fields from the prioritized referral link the REST twin documents', () => {
    const schema = getReferralLinksTool.meta?.outputSchema as unknown as { oneOf: JsonSchema[] }
    const item = (properties(schema.oneOf[0])['links'] as { items: JsonSchema }).items
    const documentedItem = (
      properties(
        documentedResponseSchema('get', '/api/v1/topics/{id}/prioritized-referral-links', '200'),
      )['links'] as { items: JsonSchema }
    ).items

    for (const field of ['id', 'url', 'label', 'priority_group']) {
      expect(properties(item)[field]).toEqual(properties(documentedItem)[field])
    }
  })
})
