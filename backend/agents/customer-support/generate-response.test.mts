import { it, expect, vi, beforeEach, describe } from 'vitest'
import { generateSupportResponse, type GenerateSupportResponseDeps } from './generate-response.mts'
import type {
  SupportMessage,
  SupportAgentRun,
  SupportThreadWithStatus,
} from '@services/customer-support/types'
import type { BasicUser } from '@services/users/types'

const testThread: SupportThreadWithStatus = {
  id: 'thread-1',
  subject: 'My credit card was declined',
  support_contact_id: 'contact-1',
  conversation_id: null,
  created_at: new Date(),
  updated_at: new Date(),
  assigned_at: null,
  assigned_to_id: null,
  resolved_at: null,
  resolved_by_id: null,
  status: 'open',
  contact_user_id: null,
}

const inboundMessage: SupportMessage = {
  id: 'msg-1',
  support_thread_id: 'thread-1',
  direction: 'inbound',
  body_text: 'Hi, my credit card was declined at checkout.',
  body_html: '',
  created_at: new Date(),
  created_by_id: null,
  updated_at: new Date(),
  email_message_id: null,
  email_subject: null,
  email_from: null,
  email_to: null,
  drafted_at: null,
  edited_at: null,
  edited_by_id: null,
  approved_at: null,
  approved_by_id: null,
  sent_at: null,
}

const testAgentRun = {
  id: 'run-1',
  support_thread_id: 'thread-1',
  support_message_id: 'msg-1',
  model_name: 'gpt-5.4-nano',
  model_provider: 'openai',
} as unknown as SupportAgentRun

const supportAgentUser = {
  __entity_type: 'user',
  id: 'support-agent-1',
  username: 'customer-support',
  roles: ['customer_support'],
} as unknown as BasicUser

const pageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }
describe('generate-response', () => {
  type MockFn<T extends (...args: any[]) => any> = ReturnType<typeof vi.fn<T>>
  type MockDeps = GenerateSupportResponseDeps & {
    getSupportThreadById: MockFn<NonNullable<GenerateSupportResponseDeps['getSupportThreadById']>>
    getSupportMessagesByThreadId: MockFn<
      NonNullable<GenerateSupportResponseDeps['getSupportMessagesByThreadId']>
    >
    createSupportDraftMessage: MockFn<
      NonNullable<GenerateSupportResponseDeps['createSupportDraftMessage']>
    >
    createSupportAgentRun: MockFn<NonNullable<GenerateSupportResponseDeps['createSupportAgentRun']>>
    updateSupportAgentRunOutput: MockFn<
      NonNullable<GenerateSupportResponseDeps['updateSupportAgentRunOutput']>
    >
    updateSupportAgentRunError: MockFn<
      NonNullable<GenerateSupportResponseDeps['updateSupportAgentRunError']>
    >
    getCustomerSupportAgentUser: MockFn<
      NonNullable<GenerateSupportResponseDeps['getCustomerSupportAgentUser']>
    >
    runToolLoop: MockFn<NonNullable<GenerateSupportResponseDeps['runToolLoop']>>
  }
  let deps: MockDeps
  beforeEach(() => {
    vi.clearAllMocks()
    deps = {
      getSupportThreadById:
        vi.fn<NonNullable<GenerateSupportResponseDeps['getSupportThreadById']>>(),
      getSupportMessagesByThreadId:
        vi.fn<NonNullable<GenerateSupportResponseDeps['getSupportMessagesByThreadId']>>(),
      createSupportDraftMessage:
        vi.fn<NonNullable<GenerateSupportResponseDeps['createSupportDraftMessage']>>(),
      createSupportAgentRun:
        vi.fn<NonNullable<GenerateSupportResponseDeps['createSupportAgentRun']>>(),
      updateSupportAgentRunOutput:
        vi.fn<NonNullable<GenerateSupportResponseDeps['updateSupportAgentRunOutput']>>(),
      updateSupportAgentRunError:
        vi.fn<NonNullable<GenerateSupportResponseDeps['updateSupportAgentRunError']>>(),
      getCustomerSupportAgentUser:
        vi.fn<NonNullable<GenerateSupportResponseDeps['getCustomerSupportAgentUser']>>(),
      runToolLoop: vi.fn<NonNullable<GenerateSupportResponseDeps['runToolLoop']>>(),
    } satisfies MockDeps
    deps.createSupportAgentRun.mockResolvedValue(testAgentRun)
    deps.updateSupportAgentRunOutput.mockResolvedValue(undefined)
    deps.updateSupportAgentRunError.mockResolvedValue(undefined)
    deps.createSupportDraftMessage.mockResolvedValue(inboundMessage)
    deps.getCustomerSupportAgentUser.mockResolvedValue(supportAgentUser)
  })

  it('returns early when thread not found', async () => {
    deps.getSupportThreadById.mockResolvedValueOnce(null)

    await generateSupportResponse('nonexistent-thread', deps)

    expect(deps.runToolLoop).not.toHaveBeenCalled()
    expect(deps.createSupportAgentRun).not.toHaveBeenCalled()
  })

  it('returns early when no messages in thread', async () => {
    deps.getSupportThreadById.mockResolvedValueOnce(testThread)
    deps.getSupportMessagesByThreadId.mockResolvedValueOnce({
      results: [],
      page_info: pageInfo,
    })

    await generateSupportResponse('thread-1', deps)

    expect(deps.runToolLoop).not.toHaveBeenCalled()
  })

  it('returns early when no inbound message to respond to', async () => {
    const outboundMessage: SupportMessage = { ...inboundMessage, direction: 'outbound' }
    deps.getSupportThreadById.mockResolvedValueOnce(testThread)
    deps.getSupportMessagesByThreadId.mockResolvedValueOnce({
      results: [outboundMessage],
      page_info: pageInfo,
    })

    await generateSupportResponse('thread-1', deps)

    expect(deps.runToolLoop).not.toHaveBeenCalled()
  })

  it('calls runToolLoop with correct config including extraParams', async () => {
    deps.getSupportThreadById.mockResolvedValueOnce(testThread)
    deps.getSupportMessagesByThreadId.mockResolvedValueOnce({
      results: [inboundMessage],
      page_info: pageInfo,
    })
    deps.runToolLoop.mockResolvedValueOnce({
      text: 'Your card may have been declined due to...',
      iterations: 2,
      terminationReason: 'no_tool_calls',
    })

    await generateSupportResponse('thread-1', deps)
    expect(deps.getSupportThreadById).toHaveBeenCalledWith('thread-1')
    expect(deps.getSupportMessagesByThreadId).toHaveBeenCalledWith('thread-1', { limit: 20 })
    expect(deps.runToolLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.4-nano',
        maxIterations: 5,
        safetyIdentifier: 'support-agent',
        extraParams: expect.objectContaining({
          service_tier: 'flex',
          prompt_cache_key: 'support-agent-v1',
        }),
      }),
    )
  })

  it('loads the customer support system user instead of using administrator roles', async () => {
    deps.getSupportThreadById.mockResolvedValueOnce(testThread)
    deps.getSupportMessagesByThreadId.mockResolvedValueOnce({
      results: [inboundMessage],
      page_info: pageInfo,
    })
    deps.runToolLoop.mockResolvedValueOnce({
      text: 'Response here',
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })

    await generateSupportResponse('thread-1', deps)

    expect(deps.getCustomerSupportAgentUser).toHaveBeenCalled()
  })

  it('records agent run error when the customer support user is misconfigured', async () => {
    deps.getSupportThreadById.mockResolvedValueOnce(testThread)
    deps.getSupportMessagesByThreadId.mockResolvedValueOnce({
      results: [inboundMessage],
      page_info: pageInfo,
    })
    deps.getCustomerSupportAgentUser.mockRejectedValueOnce(
      new Error('System user @customer-support is missing customer_support role'),
    )

    await generateSupportResponse('thread-1', deps)

    expect(deps.runToolLoop).not.toHaveBeenCalled()
    expect(deps.updateSupportAgentRunError).toHaveBeenCalledWith(testAgentRun.id, {
      error: 'System user @customer-support is missing customer_support role',
    })
  })

  it('input contains external-content wrapper with sanitized subject', async () => {
    deps.getSupportThreadById.mockResolvedValueOnce(testThread)
    deps.getSupportMessagesByThreadId.mockResolvedValueOnce({
      results: [inboundMessage],
      page_info: pageInfo,
    })
    deps.runToolLoop.mockResolvedValueOnce({
      text: 'Response here',
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })

    await generateSupportResponse('thread-1', deps)

    const callArg = deps.runToolLoop.mock.calls[0][0]
    expect(callArg.input).toContain('<external-content')
    expect(callArg.input).toContain('support-thread')
    expect(callArg.input).toContain('My credit card was declined')
  })

  it('creates draft message when runToolLoop returns response text', async () => {
    deps.getSupportThreadById.mockResolvedValueOnce(testThread)
    deps.getSupportMessagesByThreadId.mockResolvedValueOnce({
      results: [inboundMessage],
      page_info: pageInfo,
    })
    deps.runToolLoop.mockResolvedValueOnce({
      text: 'Please check your billing address.',
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })

    await generateSupportResponse('thread-1', deps)

    expect(deps.createSupportDraftMessage).toHaveBeenCalledWith('thread-1', {
      bodyText: 'Please check your billing address.',
      agentRunId: testAgentRun.id,
    })
  })

  it('skips draft creation when runToolLoop returns empty text', async () => {
    deps.getSupportThreadById.mockResolvedValueOnce(testThread)
    deps.getSupportMessagesByThreadId.mockResolvedValueOnce({
      results: [inboundMessage],
      page_info: pageInfo,
    })
    deps.runToolLoop.mockResolvedValueOnce({
      text: null,
      iterations: 5,
      terminationReason: 'max_iterations',
    })

    await generateSupportResponse('thread-1', deps)

    expect(deps.createSupportDraftMessage).not.toHaveBeenCalled()
    expect(deps.updateSupportAgentRunOutput).toHaveBeenCalled()
  })

  it('records agent run output with iterations and terminationReason', async () => {
    deps.getSupportThreadById.mockResolvedValueOnce(testThread)
    deps.getSupportMessagesByThreadId.mockResolvedValueOnce({
      results: [inboundMessage],
      page_info: pageInfo,
    })
    deps.runToolLoop.mockResolvedValueOnce({
      text: 'Draft reply',
      iterations: 3,
      terminationReason: 'no_tool_calls',
    })

    await generateSupportResponse('thread-1', deps)

    expect(deps.updateSupportAgentRunOutput).toHaveBeenCalledWith(
      testAgentRun.id,
      { response: 'Draft reply', iterations: 3 },
      'no_tool_calls',
    )
  })
})
