import {
  CONTRIBUTING_USER_AGE_MS,
  createTestPost,
  createTestUrlWithHostname,
  createTestUser,
  createTestUserWithAge,
} from '@voucha/test-helpers'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { describe, expect, it } from 'vitest'

const PROFILE_SCOPES = ['financial-profile:read', 'financial-profile:write'] as const
const RELATION_SCOPES = ['entity-relations:read', 'entity-relations:write'] as const

// Each tool returns its real result through the real call path, which checks it against the
// published output schema.
describe('MCP output schema contract for the remaining write tools — real DB', () => {
  it('returns update_my_financial_profile with every field set', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }

    const result = await callStructuredMcpTool(
      caller,
      'update_my_financial_profile',
      {
        currency: 'usd',
        credit_score_range: '740-799',
        stated_income_range: {
          minimum: { amount: 7_500_000, currency: 'usd' },
          maximum: { amount: 10_000_000, currency: 'usd' },
        },
        total_credit_limit: { amount: 50_000_000, currency: 'usd' },
        years_of_credit_history: 8,
      },
      PROFILE_SCOPES,
    )

    expect(result).toEqual({
      success: true,
      profile: {
        credit_score_range: '740-799',
        stated_income_range: {
          minimum: { amount: 7_500_000, currency: 'usd' },
          maximum: { amount: 10_000_000, currency: 'usd' },
        },
        total_credit_limit: { amount: 50_000_000, currency: 'usd' },
        currency: 'usd',
        years_of_credit_history: 8,
      },
    })
  })

  it('returns update_my_financial_profile with every optional field cleared', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    await callStructuredMcpTool(
      caller,
      'update_my_financial_profile',
      { currency: 'usd', credit_score_range: '740-799', years_of_credit_history: 8 },
      PROFILE_SCOPES,
    )

    const result = await callStructuredMcpTool(
      caller,
      'update_my_financial_profile',
      {
        credit_score_range: null,
        stated_income_range: null,
        total_credit_limit: null,
        years_of_credit_history: null,
      },
      PROFILE_SCOPES,
    )

    expect(result).toMatchObject({
      success: true,
      profile: {
        credit_score_range: null,
        stated_income_range: null,
        total_credit_limit: null,
        years_of_credit_history: null,
      },
    })
  })

  it('returns add_entity_relation for a relation between existing entities', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const post = await createTestPost({ user: author })
    const urlId = await createTestUrlWithHostname()

    const result = await callStructuredMcpTool(
      { ...contributor, membership_plan: 'plus' },
      'add_entity_relation',
      {
        action: 'add_relation',
        entity_type: 'post',
        entity_id: post.id,
        predicate: 'related',
        object_type: 'url',
        object_id: urlId,
      },
      RELATION_SCOPES,
    )

    expect(result).toEqual({
      relation_id: expect.any(String),
      subject_type: 'post',
      subject_id: post.id,
      predicate: 'related',
      object_type: 'url',
      object_id: urlId,
    })
  })

  it('returns add_entity_relation for a hashtag on the caller own post', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const post = await createTestPost({ user: author })

    const result = await callStructuredMcpTool(
      { ...author, membership_plan: 'plus' },
      'add_entity_relation',
      { action: 'add_tag', post_id: post.id, tag: '#contract' },
      RELATION_SCOPES,
    )

    expect(result).toEqual({
      post_id: post.id,
      tag: expect.any(String),
      topic_alias_id: expect.any(String),
    })
  })
})
