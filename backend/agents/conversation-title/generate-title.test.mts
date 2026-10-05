import { randomUUID } from 'node:crypto'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import { APIError } from 'openai'
import { Responses } from 'openai/resources/responses/responses'
import openAIClient from '@modules/openai-utils/client'
import {
  createTestUser,
  countAiUsageRecordsForResponseId,
  findAiUsageRecordForResponseId,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import {
  createTitleResponseStream,
  deleteTitleResponseFixture,
  readTitleResponseRegistration,
} from '@voucha/test-helpers/conversation-title-response'
import {
  makeSdkResponse,
  makeSdkTextResponse,
} from '../../test-helpers/modules/openai-utils/responses.mts'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
import { SpendCapBreachError } from '../../services/ai-usage/index.mts'
import type { PrivateUser } from '@services/users/types'
import { DEFAULT_AGENT_MODEL } from '@agents/_shared'
import {
  generateChatTitleFromInput,
  getConversationTitleGenerationInput,
} from './generate-title.mts'

describe('conversation title input and model owners', () => {
  let user: PrivateUser
  let create: MockInstance<typeof Responses.prototype.create>
  let cancel: MockInstance<typeof Responses.prototype.cancel>
  let retrieve: MockInstance<typeof Responses.prototype.retrieve>
  const calls: Promise<string>[] = []
  const fixtures: ReturnType<typeof createTitleResponseStream>[] = []
  const responseIds: string[] = []

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    // Only the external SDK credential boundary is controlled; the application client stays real.
    vi.stubEnv('OPENAI_API_KEY', 'owned-title-provider-fixture')
    create = vi.spyOn(Responses.prototype, 'create')
    create.mockRejectedValue(new Error('Unexpected OpenAI title provider call'))
    cancel = vi.spyOn(Responses.prototype, 'cancel')
    cancel.mockRejectedValue(new Error('Unexpected cancellation of a terminal title response'))
    retrieve = vi.spyOn(Responses.prototype, 'retrieve')
    retrieve.mockRejectedValue(new Error('Unexpected title response retrieval'))
    if (Object.getPrototypeOf(openAIClient.responses) !== Responses.prototype) {
      throw new Error('The default OpenAI client uses a different Responses SDK prototype')
    }
  })

  afterEach(async () => {
    try {
      await Promise.allSettled(calls.splice(0))
      for (const fixture of fixtures.splice(0)) fixture.dispose()
      await Promise.all(responseIds.splice(0).map(deleteTitleResponseFixture))
    } finally {
      create.mockRestore()
      cancel.mockRestore()
      retrieve.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  function runTitle(input: string): Promise<string> {
    const call = generateChatTitleFromInput(input, user.id)
    calls.push(call)
    return call
  }

  async function makeInput(content = `Hello, can you help? ${randomUUID()}`): Promise<string> {
    const conversation = await createConversation(user.id, `Chat ${randomUUID()}`)
    await createConversationMessage(conversation.id, user.id, WEB_PROVENANCE, {
      role: 'user',
      content,
    })
    const input = await getConversationTitleGenerationInput(conversation.id)
    if (input === null) throw new Error('The real conversation message did not produce title input')
    return input
  }

  function prepareResponse(text: string) {
    const responseId = `resp-title-${randomUUID()}`
    responseIds.push(responseId)
    const response = makeSdkTextResponse(text, {
      id: responseId,
      model: 'gpt-5.4-nano-2026-03-17',
      service_tier: 'flex',
    })
    const fixture = createTitleResponseStream(response)
    fixtures.push(fixture)
    return { responseId, response, fixture }
  }

  async function expectSettledResponse(
    responseId: string,
    fixture: ReturnType<typeof createTitleResponseStream>,
  ): Promise<void> {
    expect(fixture.getRegistration()).toMatchObject({
      response_id: responseId,
      agent_slug: 'chat-generate-title',
      lease_token: expect.any(String),
    })
    await expect(readTitleResponseRegistration(responseId)).resolves.toBeNull()
    await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
    expect(cancel).not.toHaveBeenCalled()
    expect(retrieve).not.toHaveBeenCalled()
  }

  it('returns null input without a model call when the conversation has no messages', async () => {
    const conversation = await createConversation(user.id, `Empty ${randomUUID()}`)
    await expect(getConversationTitleGenerationInput(conversation.id)).resolves.toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('loads only the two recent messages and truncates and wraps real sanitized input', async () => {
    const conversation = await createConversation(user.id, `Input ${randomUUID()}`)
    await createConversationMessage(conversation.id, user.id, WEB_PROVENANCE, {
      role: 'user',
      content: 'Excluded oldest message',
    })
    await createConversationMessage(conversation.id, user.id, WEB_PROVENANCE, {
      role: 'user',
      content: 'a'.repeat(1001),
    })
    await createConversationMessage(conversation.id, user.id, WEB_PROVENANCE, {
      role: 'assistant',
      content: 'Recent assistant message',
    })
    const input = await getConversationTitleGenerationInput(conversation.id)
    expect(input).not.toBeNull()
    expect(input).not.toContain('Excluded oldest message')
    expect(input).toContain(`${'a'.repeat(1000)}...`)
    expect(input).not.toContain('a'.repeat(1001))
    expect(input).toContain('contentType="chat_user_message"')
    expect(input).toContain('contentType="chat_assistant_message"')
    expect(input).toContain('Recent assistant message')
    expect(create).not.toHaveBeenCalled()
  })

  it('generates a trimmed title through the real model, lease and billing owners', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const input = await makeInput()
      const { responseId, fixture } = prepareResponse(' "Great Chat Title" ')
      create.mockResolvedValueOnce(fixture.stream)
      await expect(runTitle(input)).resolves.toBe('Great Chat Title')
      expect(create).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          input,
          model: DEFAULT_AGENT_MODEL,
          safety_identifier: user.id,
          stream: true,
          background: true,
        }),
        expect.objectContaining({ maxRetries: 0 }),
      )
      await expectSettledResponse(responseId, fixture)
      await expect(findAiUsageRecordForResponseId(responseId)).resolves.toMatchObject({
        agent_slug: 'chat-generate-title',
        model: 'gpt-5.4-nano-2026-03-17',
        service_tier: 'flex',
        input_tokens: 1,
        output_tokens: 1,
        pricing_status: 'priced',
      })
    })
  })

  it('uses exactly one application retry and disables SDK retries on both attempts', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const input = await makeInput()
      const { responseId, fixture } = prepareResponse('Title')
      create.mockRejectedValueOnce(capacityError()).mockResolvedValueOnce(fixture.stream)
      await expect(runTitle(input)).resolves.toBe('Title')
      expect(create).toHaveBeenCalledTimes(2)
      expect(create.mock.calls.map(call => call[1])).toEqual([{ maxRetries: 0 }, { maxRetries: 0 }])
      await expectSettledResponse(responseId, fixture)
    })
  })

  it('propagates unavailable capacity after the two physical attempt budget is exhausted', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const error = capacityError()
      create.mockRejectedValue(error)
      await expect(runTitle(await makeInput())).rejects.toBe(error)
      expect(create).toHaveBeenCalledTimes(2)
      expect(create.mock.calls.map(call => call[1])).toEqual([{ maxRetries: 0 }, { maxRetries: 0 }])
    })
  })

  it('returns the empty-output fallback after real response completion', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const { responseId, fixture } = prepareResponse('')
      create.mockResolvedValueOnce(fixture.stream)
      await expect(runTitle(await makeInput())).resolves.toBe('New Conversation')
      await expectSettledResponse(responseId, fixture)
    })
  })

  it.each(['failed', 'incomplete'] as const)(
    'records the exact owned ledger row before a %s streaming response error propagates',
    async status => {
      await withReservedAiUsageDay(1_000_000, async () => {
        const responseId = `resp-title-${randomUUID()}`
        responseIds.push(responseId)
        const fixture = createTitleResponseStream(
          makeSdkResponse({
            id: responseId,
            status,
            model: 'gpt-5.4-nano-2026-03-17',
            service_tier: 'flex',
            usage: {
              input_tokens: 84_732,
              input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
              output_tokens: 6391,
              output_tokens_details: { reasoning_tokens: 0 },
              total_tokens: 91_123,
            },
            error:
              status === 'failed'
                ? { code: 'server_error', message: 'Title provider failed' }
                : null,
            incomplete_details: status === 'incomplete' ? { reason: 'max_output_tokens' } : null,
          }),
        )
        fixtures.push(fixture)
        create.mockResolvedValueOnce(fixture.stream)
        await expect(runTitle(await makeInput())).rejects.toThrow(
          status === 'failed'
            ? 'OpenAI response failed (server_error): Title provider failed'
            : 'OpenAI response incomplete: max_output_tokens',
        )
        expect(create).toHaveBeenCalledOnce()
        await expectSettledResponse(responseId, fixture)
        const row = await findAiUsageRecordForResponseId(responseId)
        expect(row).toMatchObject({
          agent_slug: 'chat-generate-title',
          model: 'gpt-5.4-nano-2026-03-17',
          service_tier: 'flex',
          input_tokens: 84_732,
          output_tokens: 6391,
          pricing_status: 'priced',
        })
        expect(Number(row?.cost_microunits)).toBeGreaterThan(0)
      })
    },
  )

  it('enforces the real spend cap before any provider call', async () => {
    await withReservedAiUsageDay(0, async () => {
      await expect(runTitle(await makeInput())).rejects.toBeInstanceOf(SpendCapBreachError)
      expect(create).not.toHaveBeenCalled()
    })
  })
})

function capacityError(): APIError {
  return new APIError(
    429,
    { code: 'resource_unavailable' },
    'Resource unavailable',
    new Headers({ 'retry-after-ms': '0' }),
  )
}
