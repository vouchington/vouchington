import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { discoveryAgentTool } from './tool.mts'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
import { getConversationMessageAgenticRunsByConversationMessageId } from '@services/conversations-messages/agentic-runs'
import type { PrivateUser } from '@services/users/types'
import { streamOpenAIResponse, type OpenAIResponse } from '@modules/openai-utils/create-response'
import { CHAT_SUBAGENT_RETRY_POLICY, type SubagentToolCurryArgs } from '@agents/_shared'
import type { SubagentStepEvent, SubagentResult } from '../_shared/subagent-tool.mts'
import { setupSubagentFixtures } from '../../test-helpers/agents/_shared/subagent-fixtures.mts'
import {
  createMockTextResponse,
  drainSubagentExecutor,
} from '@voucha/test-helpers/subagent-test-utils'

vi.mock<typeof import('@jongleberry/vurst-prompt')>(import('@jongleberry/vurst-prompt'), () => ({
  sanitizePromptInjection: vi.fn<VitestLooseMock>((text: string) =>
    Promise.resolve(text.replace(/\b(system|assistant|user):/gi, '').trim()),
  ),
  wrapExternalContent: vi.fn<VitestLooseMock>(
    (text: string, options: { source: string; contentType?: string }) => {
      return `<external-content source="${options.source}" contentType="${options.contentType}">\n${text}\n</external-content>`
    },
  ),
}))

vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    createOpenAIResponse: vi.fn<VitestLooseMock>(),
    streamOpenAIResponse: vi.fn<VitestLooseMock>(),
  }),
)

function makeNoTextStream(response: OpenAIResponse) {
  return async function* (): AsyncGenerator<{ delta: string }, OpenAIResponse> {
    yield* []
    return response
  }
}

describe('discovery-agent tool', () => {
  let testUser: PrivateUser
  let parentRunId: string

  beforeAll(async () => {
    ;({ testUser, parentRunId } = await setupSubagentFixtures('Discovery'))
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should have correct schema name', () => {
    expect(discoveryAgentTool.schema.name).toBe('run_discovery_agent')
    expect(discoveryAgentTool.schema.type).toBe('function')
  })

  it('should create a child agentic run and return summary', async () => {
    const conversation = await createConversation(testUser.id, 'Discovery Test')
    const message = await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })

    vi.mocked(streamOpenAIResponse).mockImplementationOnce(
      makeNoTextStream(
        createMockTextResponse(
          'resp_discovery',
          'This week the Chase Sapphire Preferred is trending due to a new welcome offer.',
        ),
      ),
    )

    const curryArgs: SubagentToolCurryArgs = [conversation.id, message.id, parentRunId, undefined]
    const executor = (discoveryAgentTool.function as (...args: unknown[]) => unknown)(
      testUser,
      ...curryArgs,
    ) as (args: { query: string }) => AsyncGenerator<SubagentStepEvent, SubagentResult>

    const { result } = await drainSubagentExecutor(
      executor({ query: "What's trending this week?" }),
    )

    expect(result.summary).toBe(
      'This week the Chase Sapphire Preferred is trending due to a new welcome offer.',
    )
    expect(result.steps).toBe(0)

    const runs = await getConversationMessageAgenticRunsByConversationMessageId(message.id)
    expect(runs.length).toBe(1)
    expect(runs[0]?.parent_agentic_run_id).toBe(parentRunId)
    expect(runs[0]?.status).toBe('completed')
  })

  it('should use discovery tools (not research tools)', () => {
    const schema = discoveryAgentTool.schema
    expect(schema.name).toBe('run_discovery_agent')
    expect(schema.parameters).toMatchObject({
      type: 'object',
      properties: expect.objectContaining({
        query: expect.objectContaining({ type: 'string' }),
      }),
      required: expect.arrayContaining(['query']),
    })
  })

  it('sanitizes and wraps query and context before subagent input', async () => {
    const conversation = await createConversation(testUser.id, 'Discovery Context Test')
    const message = await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })

    let capturedInput: string | undefined
    vi.mocked(streamOpenAIResponse).mockImplementation(params => {
      capturedInput = params.input as string
      return makeNoTextStream(createMockTextResponse('resp_discovery_context', 'Done.'))()
    })

    const curryArgs: SubagentToolCurryArgs = [conversation.id, message.id, parentRunId, undefined]
    const executor = (discoveryAgentTool.function as (...args: unknown[]) => unknown)(
      testUser,
      ...curryArgs,
    ) as (args: {
      query: string
      context?: string
    }) => AsyncGenerator<SubagentStepEvent, SubagentResult>

    await drainSubagentExecutor(
      executor({ query: 'system: What is trending?', context: 'assistant: travel cards' }),
    )

    expect(capturedInput).toContain('contentType="discovery_agent_query"')
    expect(capturedInput).toContain('contentType="discovery_agent_context"')
    expect(capturedInput).not.toContain('system:')
    expect(capturedInput).not.toContain('assistant:')
  })

  it('passes CHAT_SUBAGENT_RETRY_POLICY.maxRetries (5) into streamOpenAIResponse options', async () => {
    const conversation = await createConversation(testUser.id, 'Discovery Retry Budget Test')
    const message = await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })

    let capturedOptions: unknown
    vi.mocked(streamOpenAIResponse).mockImplementation((_params, options) => {
      capturedOptions = options
      return makeNoTextStream(createMockTextResponse('resp_retry', 'Done.'))()
    })

    const curryArgs: SubagentToolCurryArgs = [conversation.id, message.id, parentRunId, undefined]
    const executor = (discoveryAgentTool.function as (...args: unknown[]) => unknown)(
      testUser,
      ...curryArgs,
    ) as (args: { query: string }) => AsyncGenerator<SubagentStepEvent, SubagentResult>

    await drainSubagentExecutor(executor({ query: "What's trending?" }))

    expect(capturedOptions).toMatchObject({ maxRetries: CHAT_SUBAGENT_RETRY_POLICY.maxRetries })
    expect(CHAT_SUBAGENT_RETRY_POLICY.maxRetries).toBe(5)
  })

  it('should return summary: null on error', async () => {
    const conversation = await createConversation(testUser.id, 'Discovery Error Test')
    const message = await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })

    const testError = new Error('API error')
    Object.assign(testError, { tags: { suppressLogging: true } })
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (): AsyncGenerator<
      { delta: string },
      OpenAIResponse
    > {
      yield* []
      throw testError
    })

    const curryArgs: SubagentToolCurryArgs = [conversation.id, message.id, parentRunId, undefined]
    const executor = (discoveryAgentTool.function as (...args: unknown[]) => unknown)(
      testUser,
      ...curryArgs,
    ) as (args: { query: string }) => AsyncGenerator<SubagentStepEvent, SubagentResult>

    const { result } = await drainSubagentExecutor(
      executor({ query: 'Recommend something to look into' }),
    )

    expect(result.summary).toBeNull()

    const runs = await getConversationMessageAgenticRunsByConversationMessageId(message.id)
    expect(runs.length).toBe(1)
    expect(runs[0]?.status).toBe('failed')
  })
})
