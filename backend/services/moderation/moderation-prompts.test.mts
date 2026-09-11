import { expect, it, describe } from 'vitest'
import {
  buildOpenAIPostLLMModerationPromptByIdQuery,
  buildOpenAIPostLLMModerationPromptsQuery,
} from './moderation-prompts.mts'

describe('moderation-prompts', () => {
  it('prompt by id query is restricted to moderator agents', () => {
    const query = buildOpenAIPostLLMModerationPromptByIdQuery('prompt-id')
    expect(query.text).toContain('INNER JOIN agents a ON a.id = ap.agent_id')
    expect(query.text).toContain("a.agent_type = 'moderator'")
  })

  it('list prompts query is restricted to moderator agents', () => {
    const query = buildOpenAIPostLLMModerationPromptsQuery({
      sort: 'activated',
    })

    expect(query.text).toContain('INNER JOIN agents a ON a.id = ap.agent_id')
    expect(query.text).toContain("a.agent_type = 'moderator'")
  })
})
