import { describe, expect, it } from 'vitest'
import { generateToolTurn } from '@modules/model-providers/tool-turn'
import { TEST_MODEL_SELECTION } from '@voucha/test-helpers/agents/model-call-result'
import { prepareAutotaggerAgentFixture } from '@voucha/test-helpers/autotagger-agent-golden-input'
import { autotaggerGoldenFixtures } from '@voucha/test-helpers/classifier-golden-fixtures'
import {
  callWithDeadlineAndOneRetry,
  SMOKE_CALL_DEADLINE_MS,
} from '@voucha/test-helpers/provider-call-deadline'
import { AUTOTAGGER_AGENT_INSTRUCTIONS } from './agent-instructions.mts'
import { SEARCH_TOPICS_TOOL, SUBMIT_TOPICS_TOOL } from './agent-tools.mts'

describe('autotagger agent on Anthropic', () => {
  // no-mistakes-timeout-reason: one live Anthropic call under its own deadline, plus one retry
  it('answers one fixture with a tool call through the production instructions', async () => {
    const fixture = autotaggerGoldenFixtures[0]!
    const { input, tools } = await prepareAutotaggerAgentFixture(fixture)

    const turn = await callWithDeadlineAndOneRetry(fixture.id, SMOKE_CALL_DEADLINE_MS, signal =>
      generateToolTurn(
        TEST_MODEL_SELECTION,
        {
          instructions: AUTOTAGGER_AGENT_INSTRUCTIONS,
          messages: [{ role: 'user', text: input }],
          tools,
          maxOutputTokens: 3000,
          promptCacheKey: 'autotagger-agent-v1',
        },
        { openaiTransport: 'openrouter', signal },
      ),
    )

    expect(turn.output.toolCalls.length).toBeGreaterThan(0)
    for (const call of turn.output.toolCalls) {
      expect([SEARCH_TOPICS_TOOL, SUBMIT_TOPICS_TOOL]).toContain(call.name)
    }
    expect(turn.usage.outputTokens).toBeGreaterThan(0)
  }, 10_000)
})
