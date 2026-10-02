import { documentedResponseProperty } from '@voucha/test-helpers/openapi-documented-response'
import { describe, expect, it } from 'vitest'
import activateReferralLinkTool from './activate-referral-link.mts'
import createReferralLinkTool from './create-referral-link.mts'
import deactivateReferralLinkTool from './deactivate-referral-link.mts'
import requestReferralLinkUnfurlTool from './request-referral-link-unfurl.mts'
import updateReferralLinkTool from './update-referral-link.mts'
import updateTopicRecommendationTool from './update-topic-recommendation.mts'

type JsonSchema = Record<string, unknown>

const properties = (schema: unknown): Record<string, unknown> =>
  (schema as JsonSchema)['properties'] as Record<string, unknown>

// These routes document their bodies from the generated components, so the tools must keep the
// schema the OpenAPI document gives the same entity rather than describing it a second time.
describe('referral link and topic recommendation tool output schemas stay pinned to the documented REST twins', () => {
  it.each([
    [createReferralLinkTool, 'post', '/api/v1/referral-links', '201'],
    [updateReferralLinkTool, 'patch', '/api/v1/referral-links/{linkId}', '200'],
    [activateReferralLinkTool, 'post', '/api/v1/referral-links/{linkId}/activations', '200'],
    [deactivateReferralLinkTool, 'delete', '/api/v1/referral-links/{linkId}/activations', '200'],
    [requestReferralLinkUnfurlTool, 'post', '/api/v1/referral-links/{linkId}/unfurls', '202'],
  ] as const)(
    'takes referral link tool %# result from the documented REST body',
    (tool, method, path, status) => {
      expect(properties(tool.meta?.outputSchema)['referral_link']).toEqual(
        documentedResponseProperty(method, path, status, 'referral_link'),
      )
    },
  )

  it('takes the updated recommendation post from the documented PATCH body', () => {
    expect(properties(updateTopicRecommendationTool.meta?.outputSchema)['post']).toEqual(
      documentedResponseProperty('patch', '/api/v1/topic-recommendations/{id}', '200', 'post'),
    )
  })
})
