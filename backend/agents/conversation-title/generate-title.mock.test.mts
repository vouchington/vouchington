import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { createTestUser, findAiUsageRecordForAgent, pollUntilNotNull } from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
import type { PrivateUser } from '@services/users/types'
import type { Response } from 'openai/resources/responses/responses'

vi.mock<typeof import('@jongleberry/vurst-prompt')>(import('@jongleberry/vurst-prompt'), () => ({
  sanitizePromptInjection: vi.fn<VitestLooseMock>((text: string) => Promise.resolve(text)),
  wrapExternalContent: vi.fn<VitestLooseMock>((text: string) => text),
}))

vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    createOpenAIResponse: vi.fn<VitestLooseMock>(),
  }),
)

import { generateChatTitle } from './generate-title.mts'
import { createOpenAIResponse } from '@modules/openai-utils/create-response'
import { SYNCHRONOUS_REQUEST_RETRY_POLICY, OpenAIResponseNotCompletedError } from '@agents/_shared'

function makeTitleResponse(text: string) {
  return {
    id: 'resp-1',
    output: [
      {
        id: 'msg-1',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
  }
}

describe('generateChatTitle', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns "New Conversation" when conversation has no messages', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Empty conv ${suffix}`)
    const title = await generateChatTitle(conv.id, user.id)
    expect(title).toBe('New Conversation')
  })

  it('generates title from messages using OpenAI', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Chat ${suffix}`)
    await createConversationMessage(conv.id, user.id, {
      role: 'user',
      content: `Hello, can you help me with something? ${suffix}`,
    })

    vi.mocked(createOpenAIResponse).mockResolvedValue(
      makeTitleResponse('Great Chat Title') as never,
    )

    const title = await generateChatTitle(conv.id, user.id)
    expect(title).toBe('Great Chat Title')
    expect(createOpenAIResponse).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(createOpenAIResponse).mock.calls[0][0] as {
      safety_identifier?: string
    }
    expect(callArgs.safety_identifier).toBe(user.id)
  })

  it('passes SYNCHRONOUS_REQUEST_RETRY_POLICY.maxRetries (1) into createOpenAIResponse options', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Retry budget conv ${suffix}`)
    await createConversationMessage(conv.id, user.id, {
      role: 'user',
      content: `Hello, can you help me with something? ${suffix}`,
    })

    vi.mocked(createOpenAIResponse).mockResolvedValue(makeTitleResponse('Title') as never)

    await generateChatTitle(conv.id, user.id)

    const options = vi.mocked(createOpenAIResponse).mock.calls[0][1]
    expect(options).toMatchObject({ maxRetries: SYNCHRONOUS_REQUEST_RETRY_POLICY.maxRetries })
    expect(SYNCHRONOUS_REQUEST_RETRY_POLICY.maxRetries).toBe(1)
  })

  it('returns "New Conversation" when createOpenAIResponse returns empty text', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Empty response ${suffix}`)
    await createConversationMessage(conv.id, user.id, {
      role: 'user',
      content: `Some message ${suffix}`,
    })

    vi.mocked(createOpenAIResponse).mockResolvedValue(makeTitleResponse('') as never)

    const title = await generateChatTitle(conv.id, user.id)
    expect(title).toBe('New Conversation')
  })

  it('records a ledger row from an incomplete response before the error propagates', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Incomplete response conv ${suffix}`)
    await createConversationMessage(conv.id, user.id, {
      role: 'user',
      content: `Hello, can you help me with something? ${suffix}`,
    })

    // max_output_tokens hit mid-call still bills the tokens it consumed. This proves the direct
    // call-site catch block records from the thrown OpenAIResponseNotCompletedError -- not just
    // from a successful response -- so a queued retry after this failure doesn't compound an
    // unrecorded charge with another one.
    vi.mocked(createOpenAIResponse).mockRejectedValueOnce(
      new OpenAIResponseNotCompletedError('OpenAI response incomplete: max_output_tokens', {
        status: 'incomplete',
        model: 'gpt-5.4-nano-2026-03-17',
        service_tier: 'flex',
        usage: { input_tokens: 84_732, output_tokens: 6391 },
        incomplete_details: { reason: 'max_output_tokens' },
      } as Response),
    )

    await expect(generateChatTitle(conv.id, user.id)).rejects.toThrow(
      'OpenAI response incomplete: max_output_tokens',
    )

    const row = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent('chat-generate-title', { inputTokens: 84_732, outputTokens: 6391 }),
    )
    if (!row) throw new Error('ai_usage_records row was not written for the failed response')
    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
    expect(row.service_tier).toBe('flex')
    expect(row.pricing_status).toBe('priced')
  })
})
