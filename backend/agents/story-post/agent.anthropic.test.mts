import { describe, expect, it } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { calcCostMicrounits } from '@modules/model-providers/pricing'
import { callStoryPostModel } from './agent.mts'

// Real Anthropic call (credentialed project `backend-anthropic`); fails without a credential.
describe('story post on Anthropic Haiku 5.5', () => {
  it('returns a title and a non-blank markdown summary', async () => {
    const result = await callStoryPostModel(
      'Story title: Storm hits coast\nPublished: 2026-10-01\n\nSource articles:\nArticle 1:\nTitle: Storm makes landfall\nSummary: A storm made landfall overnight, cutting power to 40,000 homes.',
      'story-anthropic-test',
      ANTHROPIC_HAIKU_CALL,
    )

    expect(result.output.title.trim().length).toBeGreaterThan(0)
    expect(result.output.ai_summary_markdown.trim().length).toBeGreaterThan(0)
    expect(
      calcCostMicrounits('anthropic', result.model, result.serviceTier, result.usage),
    ).not.toBeNull()
  })
})
