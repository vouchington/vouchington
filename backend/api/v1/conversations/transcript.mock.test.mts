import { beforeEach, describe, expect, it, vi } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createOpenAIModerationResponse, createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
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

describe('member transcript contract', () => {
  beforeEach(() => {
    moderation.mockReset()
    moderation.mockResolvedValue(createOpenAIModerationResponse())
  })
  it('replays duplicate and concurrent retries without adding messages, including after a later incomplete turn', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Transcript')
    const request = createRequest()
    await request.authenticateAs(user)
    const body = turn()
    const path = `/api/v1/conversations/${conversation.id}/client-generated-chat`
    const first = await request.post(path).send(body).expect(200)
    const retries = await Promise.all([
      request.post(path).send(body).expect(200),
      request.post(path).send(body).expect(200),
    ])
    for (const retry of retries) expect(retry.body).toEqual(first.body)
    expect(first.body.turn).toEqual({
      user_message_id: body.user_message_id,
      assistant_message_id: body.assistant_message_id,
    })
    expect(first.body).not.toHaveProperty('agentic_run')
    await expect(getConversationMessagesByConversationId(conversation.id)).resolves.toHaveLength(2)
    await createConversationMessage(conversation.id, user.id, { role: 'assistant', content: null })
    const retry = await request.post(path).send(body).expect(200)
    expect(retry.body).toEqual(first.body)
    await expect(getConversationMessagesByConversationId(conversation.id)).resolves.toHaveLength(3)
  })

  it('rejects changed text and partial identity reuse atomically', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Transcript')
    const request = createRequest()
    await request.authenticateAs(user)
    const body = turn()
    const path = `/api/v1/conversations/${conversation.id}/client-generated-chat`
    await request.post(path).send(body).expect(200)
    await request
      .post(path)
      .send({ ...body, assistant_content: 'Changed' })
      .expect(409)
    await request
      .post(path)
      .send({ ...body, assistant_message_id: uuidv7() })
      .expect(409)
    await expect(getConversationMessagesByConversationId(conversation.id)).resolves.toHaveLength(2)
  })

  it('preserves authorization before replay and rejects malformed message identities', async () => {
    const owner = await createTestUser()
    const other = await createTestUser()
    const conversation = await createConversation(owner.id, 'Transcript')
    const request = createRequest()
    const path = `/api/v1/conversations/${conversation.id}/client-generated-chat`
    await request.post(path).send(turn()).expect(401)
    await request.authenticateAs(other)
    await request.post(path).send(turn()).expect(403)
    await request.authenticateAs(owner)
    await request
      .post(path)
      .send({ ...turn(), user_message_id: 'not-a-uuid' })
      .expect(400)
    await expect(getConversationMessagesByConversationId(conversation.id)).resolves.toHaveLength(0)
  })

  it('paginates history with completion metadata and omits generation internals from conversations', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Transcript')
    const request = createRequest()
    await request.authenticateAs(user)
    await createConversationMessage(conversation.id, user.id, { role: 'user', content: 'Hello' })
    await createConversationMessage(conversation.id, user.id, { role: 'assistant', content: null })
    const path = `/api/v1/my/conversations/${conversation.id}/messages`
    const first = await request.get(path).query({ limit: '1' }).expect(200)
    expect(first.body.results[0].completion.status).toBe('incomplete')
    expect(first.body.page_info.has_next_page).toBe(true)
    const second = await request
      .get(path)
      .query({ limit: '1', after: first.body.page_info.end_cursor })
      .expect(200)
    expect(second.body.results[0].content.role).toBe('user')
    expect(second.body.results[0].completion.status).toBe('completed')
    expect(second.body.page_info.has_next_page).toBe(false)
    const list = await request.get('/api/v1/my/conversations').expect(200)
    expect(list.body.results[0]).not.toHaveProperty('last_response_id')
    const failed = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: 'Partial',
      error: 'Interrupted',
    })
    const history = await request.get(path).expect(200)
    expect(
      history.body.results.find((message: { id: string }) => message.id === failed.id).completion
        .status,
    ).toBe('failed')
    expect(
      history.body.results.find((message: { id: string }) => message.id === failed.id).content,
    ).not.toHaveProperty('error')
  })
})
