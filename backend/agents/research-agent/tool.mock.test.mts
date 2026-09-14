import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { researchAgentTool } from './tool.mts'
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
  createMockFunctionCallResponse,
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

function makeTextStream(delta: string, response: OpenAIResponse) {
  return async function* (): AsyncGenerator<{ delta: string }, OpenAIResponse> {
    yield { delta }
    return response
  }
}

describe('research-agent tool', () => {
  let testUser: PrivateUser
  let parentRunId: string

  beforeAll(async () => {
    ;({ testUser, parentRunId } = await setupSubagentFixtures('Research'))
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should have correct schema name', () => {
    expect(researchAgentTool.schema.name).toBe('run_research_agent')
    expect(researchAgentTool.schema.type).toBe('function')
  })

  it('should create a child agentic run with parent_agentic_run_id', async () => {
    const conversation = await createConversation(testUser.id, 'Research Test')
    const message = await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })

    vi.mocked(streamOpenAIResponse).mockImplementationOnce(
      makeNoTextStream(
        createMockTextResponse('resp_research', 'The Chase Sapphire Reserve is an excellent card.'),
      ),
    )

    const curryArgs: SubagentToolCurryArgs = [conversation.id, message.id, parentRunId, undefined]
    const executor = (researchAgentTool.function as (...args: unknown[]) => unknown)(
      testUser,
      ...curryArgs,
    ) as (args: { query: string }) => AsyncGenerator<SubagentStepEvent, SubagentResult>

    const { result } = await drainSubagentExecutor(
      executor({ query: 'What is the best travel credit card?' }),
    )

    expect(result.summary).toBe('The Chase Sapphire Reserve is an excellent card.')
    expect(result.steps).toBe(0)

    const runs = await getConversationMessageAgenticRunsByConversationMessageId(message.id)
    expect(runs.length).toBe(1)
    expect(runs[0]?.parent_agentic_run_id).toBe(parentRunId)
    expect(runs[0]?.status).toBe('completed')
  })

  it('should yield progress events for each tool call', async () => {
    const conversation = await createConversation(testUser.id, 'Research Steps Test')
    const message = await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })

    vi.mocked(streamOpenAIResponse)
      .mockImplementationOnce(
        makeNoTextStream(
          createMockFunctionCallResponse(
            'resp_1',
            'call_1',
            'search_topics',
            '{"query":"Chase Sapphire"}',
          ),
        ),
      )
      .mockImplementationOnce(
        makeNoTextStream(createMockTextResponse('resp_2', 'Research complete.')),
      )

    const curryArgs: SubagentToolCurryArgs = [conversation.id, message.id, parentRunId, undefined]
    const executor = (researchAgentTool.function as (...args: unknown[]) => unknown)(
      testUser,
      ...curryArgs,
    ) as (args: { query: string }) => AsyncGenerator<SubagentStepEvent, SubagentResult>

    const { result, events } = await drainSubagentExecutor(
      executor({ query: 'Best cashback card?' }),
    )

    expect(result.summary).toBe('Research complete.')
    expect(result.steps).toBe(1)
    expect(events).toEqual([
      { type: 'subagent_step', agent_name: 'research', tool_name: 'search_topics' },
    ])
  })

  it('should yield child text stream events without counting them as tool steps', async () => {
    const conversation = await createConversation(testUser.id, 'Research Text Stream Test')
    const message = await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })

    vi.mocked(streamOpenAIResponse).mockImplementationOnce(
      makeTextStream('Checking sources', createMockTextResponse('resp_text', 'Checking sources')),
    )

    const curryArgs: SubagentToolCurryArgs = [conversation.id, message.id, parentRunId, undefined]
    const executor = (researchAgentTool.function as (...args: unknown[]) => unknown)(
      testUser,
      ...curryArgs,
    ) as (args: { query: string }) => AsyncGenerator<SubagentStepEvent, SubagentResult>

    const { result, events } = await drainSubagentExecutor(executor({ query: 'Best card?' }))

    expect(result.summary).toBe('Checking sources')
    expect(result.steps).toBe(0)
    expect(events).toEqual([
      { type: 'subagent_text', agent_name: 'research', content: 'Checking sources' },
    ])
  })

  it('should return summary: null and mark run failed on error', async () => {
    const conversation = await createConversation(testUser.id, 'Research Error Test')
    const message = await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })

    const testError = new Error('OpenAI unavailable')
    Object.assign(testError, { tags: { suppressLogging: true } })
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (): AsyncGenerator<
      { delta: string },
      OpenAIResponse
    > {
      yield* []
      throw testError
    })

    const curryArgs: SubagentToolCurryArgs = [conversation.id, message.id, parentRunId, undefined]
    const executor = (researchAgentTool.function as (...args: unknown[]) => unknown)(
      testUser,
      ...curryArgs,
    ) as (args: { query: string }) => AsyncGenerator<SubagentStepEvent, SubagentResult>

    const { result } = await drainSubagentExecutor(executor({ query: 'Best card?' }))

    expect(result.summary).toBeNull()
    expect(result.steps).toBe(0)

    const runs = await getConversationMessageAgenticRunsByConversationMessageId(message.id)
    expect(runs.length).toBe(1)
    expect(runs[0]?.status).toBe('failed')
  })

  it('should pass context in input when provided', async () => {
    const conversation = await createConversation(testUser.id, 'Research Context Test')
    const message = await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })

    let capturedInput: string | undefined
    vi.mocked(streamOpenAIResponse).mockImplementation(params => {
      capturedInput = params.input as string
      return makeNoTextStream(createMockTextResponse('resp_ctx', 'Done.'))()
    })

    const curryArgs: SubagentToolCurryArgs = [conversation.id, message.id, parentRunId, undefined]
    const executor = (researchAgentTool.function as (...args: unknown[]) => unknown)(
      testUser,
      ...curryArgs,
    ) as (args: {
      query: string
      context?: string
    }) => AsyncGenerator<SubagentStepEvent, SubagentResult>

    await drainSubagentExecutor(
      executor({ query: 'Best card?', context: 'User has 700 credit score' }),
    )

    expect(capturedInput).toContain('contentType="research_agent_query"')
    expect(capturedInput).toContain('Best card?')
    expect(capturedInput).toContain('contentType="research_agent_context"')
    expect(capturedInput).toContain('User has 700 credit score')
  })

  it('passes CHAT_SUBAGENT_RETRY_POLICY.maxRetries (5) into streamOpenAIResponse options', async () => {
    const conversation = await createConversation(testUser.id, 'Research Retry Budget Test')
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
    const executor = (researchAgentTool.function as (...args: unknown[]) => unknown)(
      testUser,
      ...curryArgs,
    ) as (args: { query: string }) => AsyncGenerator<SubagentStepEvent, SubagentResult>

    await drainSubagentExecutor(executor({ query: 'Best card?' }))

    expect(capturedOptions).toMatchObject({ maxRetries: CHAT_SUBAGENT_RETRY_POLICY.maxRetries })
    expect(CHAT_SUBAGENT_RETRY_POLICY.maxRetries).toBe(5)
  })
})
