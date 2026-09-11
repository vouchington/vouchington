import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
import { openAiSpendCapConfig } from '@services/ai-usage'
import type { PrivateUser } from '@services/users/types'

vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    createOpenAIResponse: vi.fn<VitestLooseMock>(),
  }),
)

import { createOpenAIResponse } from '@modules/openai-utils/create-response'

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

describe('POST /api/v1/my/conversations/:conversationId/title', () => {
  let user: PrivateUser
  let otherUser: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    otherUser = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createOpenAIResponse).mockResolvedValue(
      makeTitleResponse('Great Chat Title') as never,
    )
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request
      .post('/api/v1/my/conversations/00000000-0000-7000-8000-000000000001/title')
      .expect(401)
  })

  it('returns 404 for non-existent conversation', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/conversations/00000000-0000-7000-8000-000000000001/title')
      .expect(404)
  })

  it('returns 403 for conversation owned by another user', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(otherUser.id, `Other conv ${suffix}`)

    const request = createRequest()
    await request.authenticateAs(user)
    await request.post(`/api/v1/my/conversations/${conv.id}/title`).expect(403)
  })

  it('returns 200 with AI-generated title when conversation has no title', async () => {
    // enabled: false bypasses the real spend-cap DB read (spend-cap-guard.mts's own
    // short-circuit), so this success path can't flake on unrelated ai_usage_records rows from
    // other tests sharing today's UTC window.
    await openAiSpendCapConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, { enabled: false })
    try {
      const suffix = crypto.randomUUID().slice(0, 8)
      const conv = await createConversation(user.id, '')
      await createConversationMessage(conv.id, user.id, {
        role: 'user',
        content: `Hello, what is the weather? ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.post(`/api/v1/my/conversations/${conv.id}/title`).expect(200)

      expect(response.body.conversation.id).toBe(conv.id)
      expect(response.body.conversation.title).toBe('Great Chat Title')
    } finally {
      restore()
    }
  })

  it('returns 200 with existing title without calling OpenAI when already titled', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Already named ${suffix}`)

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.post(`/api/v1/my/conversations/${conv.id}/title`).expect(200)

    expect(response.body.conversation.title).toBe(`Already named ${suffix}`)
    expect(createOpenAIResponse).not.toHaveBeenCalled()
  })

  it('returns 429 and does not call OpenAI when the daily spend cap is breached', async () => {
    await openAiSpendCapConfig.waitForInitialization()
    // 0 is the true kill-switch value (#8773 review round 4): totalMicrounits is never negative, so
    // this breaches on the very first call regardless of what other tests have written today.
    const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
      daily_cap_microunits: 0,
    })
    try {
      const suffix = crypto.randomUUID().slice(0, 8)
      const conv = await createConversation(user.id, '')
      await createConversationMessage(conv.id, user.id, {
        role: 'user',
        content: `Hello, what is the weather? ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(user)
      await request.post(`/api/v1/my/conversations/${conv.id}/title`).expect(429)

      expect(createOpenAIResponse).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('returns 200 with the local "New Conversation" fallback for an empty conversation even when the spend cap is breached', async () => {
    // Reproduces #8773 Finding 3: generateChatTitle's no-messages path never calls OpenAI, so the
    // spend cap must not gate it -- a breached cap should never turn this free fallback into a 429.
    await openAiSpendCapConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
      daily_cap_microunits: 0,
    })
    try {
      const conv = await createConversation(user.id, '')

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.post(`/api/v1/my/conversations/${conv.id}/title`).expect(200)

      expect(response.body.conversation.title).toBe('New Conversation')
      expect(createOpenAIResponse).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })
})
