import { beforeEach, describe, expect, it, vi } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  createOpenAIModerationResponse,
  createTestUser,
  readTestContentProvenance,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createConversation } from '@services/conversations-messages/create'
import { getConversationMessagesByConversationId } from '@services/conversations-messages/messages'
import { requestOpenAIModeration } from '@modules/openai-utils/moderate'

const moderation = vi.hoisted(() => vi.fn<typeof requestOpenAIModeration>())
vi.mock<typeof import('@modules/openai-utils/moderate')>(
  import('@modules/openai-utils/moderate'),
  async importOriginal => ({ ...(await importOriginal()), requestOpenAIModeration: moderation }),
)

const turn = () => ({
  user_message_id: uuidv7(),
  assistant_message_id: uuidv7(),
  message: 'Hello',
  assistant_content: 'Hi',
  model_provider: 'apple_foundation',
})

describe('POST /api/v1/conversations/:conversationId/client-generated-chat provenance', () => {
  beforeEach(() => {
    moderation.mockReset()
    moderation.mockResolvedValue(createOpenAIModerationResponse())
  })

  async function startConversation(clientHeaders: Record<string, string>) {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Provenance')
    const request = createRequest()
    request.setClientInfo(clientHeaders)
    await request.authenticateAs(user)
    return {
      conversation,
      request,
      path: `/api/v1/conversations/${conversation.id}/client-generated-chat`,
    }
  }

  it.each([
    ['web', {}],
    ['swift', { 'x-voucha-client': 'swift', 'x-voucha-platform': 'ios' }],
  ])(
    'stores the %s client on both messages of the turn and exposes none',
    async (client, headers) => {
      const { request, path } = await startConversation(headers)
      const body = turn()

      const response = await request.post(path).send(body).expect(200)

      for (const id of [body.user_message_id, body.assistant_message_id]) {
        await expect(readTestContentProvenance('conversation_messages', id)).resolves.toEqual({
          createdVia: client,
          oauthClientId: null,
        })
      }
      expect(JSON.stringify(response.body)).not.toMatch(/created_via|oauth/)
    },
  )

  it('replays a retry from another client without rewriting the stored channel', async () => {
    const { request, path } = await startConversation({})
    const body = turn()
    const first = await request.post(path).send(body).expect(200)

    request.setClientInfo({ 'x-voucha-client': 'swift', 'x-voucha-platform': 'ios' })
    const retry = await request.post(path).send(body).expect(200)

    expect(retry.body).toEqual(first.body)
    await expect(
      readTestContentProvenance('conversation_messages', body.user_message_id),
    ).resolves.toEqual({ createdVia: 'web', oauthClientId: null })
  })

  it('rejects a turn whose client information is invalid and stores nothing', async () => {
    const { conversation, request, path } = await startConversation({
      'x-voucha-client': 'unclassified-client',
    })

    const response = await request.post(path).send(turn()).expect(400)

    expect(response.body.code).toBe('INVALID_CLIENT_INFO')
    await expect(getConversationMessagesByConversationId(conversation.id)).resolves.toEqual([])
    expect(moderation).not.toHaveBeenCalled()
  })
})
