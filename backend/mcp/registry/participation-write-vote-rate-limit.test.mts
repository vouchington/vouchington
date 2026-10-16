import { describe, expect, it, vi } from 'vitest'
import { RATE_LIMIT } from '@modules/on-error/error-codes'
import { chargeElectionVoteRateLimit } from '@services/elections-votes/shared'
import { getTopicElectionVote } from '@services/elections-votes/topic'
import { createTestTopic } from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { callMcpTool } from '../../services/mcp-tools/call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from '../../services/mcp-tools/config.mts'

describe('vote MCP election limit', () => {
  it('returns a rate-limited result and audit signal when the shared election bucket is spent', async () => {
    const user = await createTestPlusMcpCaller()
    const topic = await createTestTopic()
    for (let index = 0; index < 30; index++) {
      expect(
        (await chargeElectionVoteRateLimit('topic-election-vote', user.id, undefined, null))
          .limited,
      ).toBe(false)
    }
    const onRateLimited = vi.fn<() => Promise<void>>(async () => {})

    const result = await callMcpTool(
      'vote',
      optionArgs('set_topic', { id: topic.id, choice: 'like' }),
      user,
      ['votes:write'],
      USER_MCP_SERVER_CONFIG,
      false,
      { ip: undefined, onRateLimited },
    )

    expect(result.isError).toBe(true)
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({
      error: {
        status: 429,
        code: RATE_LIMIT,
        message: 'Rate limit exceeded. Please try again later.',
        retryable: true,
      },
    })
    expect(onRateLimited).toHaveBeenCalledOnce()
    expect(await getTopicElectionVote(user.id, topic.id)).toBeNull()
  }, 30_000)
})
