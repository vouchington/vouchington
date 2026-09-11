import { describe, expect, it } from 'vitest'
import { createAutomodSimulationResults } from './automod-simulate-response.mts'
import type { CommunityAgentPrompt } from '@services/community-agent-prompts'

describe('createAutomodSimulationResults', () => {
  it('maps sampled posts to projected moderation result rows', () => {
    const results = createAutomodSimulationResults(
      makePrompt(),
      [
        {
          id: 'post-1',
          title: 'Sample post',
          markdown: 'Body',
          declared_language: 'ar',
          lingua_rs_detected_language: 'en',
          post_type: 'discussion',
          created_by_id: 'user-1',
          approved_at: new Date('2026-01-02T00:00:00Z'),
          content_excerpt: 'Sample post Body',
        },
      ],
      [{ post_id: 'post-1', flagged: true, reason: 'Matches rule' }],
    )

    expect(results).toEqual([
      {
        post_id: 'post-1',
        title: 'Sample post',
        declared_language: 'ar',
        lingua_rs_detected_language: 'en',
        post_type: 'discussion',
        approved_at: '2026-01-02T00:00:00.000Z',
        content_excerpt: 'Sample post Body',
        flagged: true,
        reason: 'Matches rule',
        would_unpublish: true,
      },
    ])
  })
})

function makePrompt(): CommunityAgentPrompt {
  return {
    id: 'prompt-1',
    community_id: 'community-1',
    created_by_id: 'user-1',
    agent_id: 'agent-1',
    prompt: 'Flag spam',
    model_name: 'gpt-5.4-nano',
    model_provider: 'openai',
    slot_allocated: false,
    on_flag_action: 'unpublish',
    activated_at: null,
    deactivated_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    deleted_at: null,
    deleted_by_id: null,
  }
}
