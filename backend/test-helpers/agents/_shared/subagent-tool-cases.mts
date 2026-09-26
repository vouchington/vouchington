import { expect, vi } from 'vitest'

import { getConversationMessageAgenticRunsByConversationMessageId } from '../../../services/conversations-messages/agentic-runs.mts'
import {
  streamOpenAIResponse,
  type OpenAIResponse,
} from '../../../modules/openai-utils/create-response.mts'
import { CHAT_SUBAGENT_RETRY_POLICY } from '../../../agents/_shared/retry-policy.mts'

import type { BasicUser } from '../../../services/users/types.mts'
import { suppressedError } from '../../suppressed-error.mts'
import { setupSubagentFixtures } from './subagent-fixtures.mts'
import {
  type AgentTool,
  type SubagentToolCaseConfig,
  mockTextResponse,
  runSubagentTool,
  seedSubagentMessage,
} from './subagent-tool-case-support.mts'

export type { SubagentToolCaseConfig } from './subagent-tool-case-support.mts'

export type SubagentToolCase = { title: string; run: () => void | Promise<void> }

export function subagentToolCases(tool: AgentTool, config: SubagentToolCaseConfig) {
  let testUser: BasicUser
  let testUserId = ''
  let parentRunId = ''
  const args = (input: string, context?: string) => ({
    [config.inputKey]: input,
    ...(context === undefined ? {} : { context }),
  })
  const run = (conversationId: string, messageId: string, input: Record<string, string>) =>
    runSubagentTool(tool, testUser, conversationId, messageId, parentRunId, input)

  const cases: SubagentToolCase[] = [
    {
      title: 'should have correct schema name',
      run: () => {
        expect(tool.schema.name).toBe(config.schemaName)
        expect(tool.schema.type).toBe('function')
      },
    },
    {
      title: 'should create a child agentic run and return summary',
      run: async () => {
        const { conversation, message } = await seedSubagentMessage(
          testUserId,
          config.summaryConversation,
        )
        vi.mocked(streamOpenAIResponse).mockImplementationOnce(
          mockTextResponse(config.summaryResponseId, config.summaryText),
        )
        const { result } = await run(conversation.id, message.id, args(config.summaryInput))
        expect(result.summary).toBe(config.summaryText)
        expect(result.steps).toBe(0)
        const runs = await getConversationMessageAgenticRunsByConversationMessageId(message.id)
        expect(runs).toMatchObject([{ parent_agentic_run_id: parentRunId, status: 'completed' }])
      },
    },
    {
      title: `should use ${config.label.toLowerCase()} tools (not research tools)`,
      run: () => {
        expect(tool.schema.name).toBe(config.schemaName)
        expect(tool.schema.parameters).toMatchObject({
          type: 'object',
          properties: expect.objectContaining({
            [config.inputKey]: expect.objectContaining({ type: 'string' }),
          }),
          required: expect.arrayContaining([config.inputKey]),
        })
      },
    },
    {
      title: `sanitizes and wraps ${config.inputKey} and context before subagent input`,
      run: async () => {
        const { conversation, message } = await seedSubagentMessage(
          testUserId,
          config.contextConversation,
        )
        let capturedInput: string | undefined
        vi.mocked(streamOpenAIResponse).mockImplementation(params => {
          capturedInput = params.input as string
          return mockTextResponse(config.contextResponseId, config.contextResult)()
        })
        await run(conversation.id, message.id, args(config.contextInput, config.contextText))
        expect(capturedInput).toContain(`contentType="${config.inputContentType}"`)
        expect(capturedInput).toContain(`contentType="${config.contextContentType}"`)
        expect(capturedInput).not.toContain('system:')
        expect(capturedInput).not.toContain('assistant:')
      },
    },
    {
      title: 'passes CHAT_SUBAGENT_RETRY_POLICY.maxRetries (5) into streamOpenAIResponse options',
      run: async () => {
        const { conversation, message } = await seedSubagentMessage(
          testUserId,
          config.retryConversation,
        )
        let capturedOptions: unknown
        vi.mocked(streamOpenAIResponse).mockImplementation((_params, options) => {
          capturedOptions = options
          return mockTextResponse('resp_retry', 'Done.')()
        })
        await run(conversation.id, message.id, args(config.retryInput))
        expect(capturedOptions).toMatchObject({ maxRetries: CHAT_SUBAGENT_RETRY_POLICY.maxRetries })
        expect(CHAT_SUBAGENT_RETRY_POLICY.maxRetries).toBe(5)
      },
    },
    {
      title: 'should return summary: null on error',
      run: async () => {
        const { conversation, message } = await seedSubagentMessage(
          testUserId,
          config.errorConversation,
        )
        const testError = suppressedError('API error')
        vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (): AsyncGenerator<
          { delta: string },
          OpenAIResponse
        > {
          yield* []
          throw testError
        })
        const { result } = await run(conversation.id, message.id, args(config.errorInput))
        expect(result.summary).toBeNull()
        const runs = await getConversationMessageAgenticRunsByConversationMessageId(message.id)
        expect(runs).toMatchObject([{ status: 'failed' }])
      },
    },
  ]

  return {
    prepare: async () => {
      const fixtures = await setupSubagentFixtures(config.label)
      testUser = fixtures.testUser
      testUserId = fixtures.testUser.id
      parentRunId = fixtures.parentRunId
    },
    reset: () => {
      vi.clearAllMocks()
    },
    cases,
  }
}
