import { describe, expect, it } from 'vitest'
import { buildModeratorPromptSyncSQL } from '../moderator-prompt-sync-sql.mts'

function makeConfig(prompt: string) {
  return {
    slug: 'self-promotion',
    prompt,
    model: 'gpt-5.4-nano' as const,
    provider: 'openai' as const,
    onFlagAction: 'review_queue' as const,
    baseline: false,
  }
}

describe('buildModeratorPromptSyncSQL', () => {
  it('dollar-quotes a prompt that does not contain any candidate tag', () => {
    const sql = buildModeratorPromptSyncSQL(makeConfig('Flag self-promotional posts.'))

    expect(sql).toContain('$prompt$Flag self-promotional posts.$prompt$')
  })

  it('falls back to manual single-quote escaping when the prompt contains every candidate tag', () => {
    const prompt =
      "Prompt containing $prompt$ and $agent$ and $mod$ and $p$ tags plus a ' apostrophe"

    const sql = buildModeratorPromptSyncSQL(makeConfig(prompt))

    expect(sql).toContain(
      "'Prompt containing $prompt$ and $agent$ and $mod$ and $p$ tags plus a '' apostrophe'",
    )
  })
})
