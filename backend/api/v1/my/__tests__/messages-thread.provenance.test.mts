import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  readTestContentProvenance,
  setTestUserDirectMessagesAudience,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/my/messages/:conversationId/messages provenance', () => {
  let sender: PrivateUser

  beforeAll(async () => {
    sender = await createTestUser()
  })

  // A pair of users has one direct thread, so each test opens it with a new recipient.
  async function openThread(clientHeaders: Record<string, string>) {
    const recipient = await createTestUser()
    await setTestUserDirectMessagesAudience(recipient.id, 'everyone')
    const request = createRequest()
    await request.authenticateAs(sender)
    const created = await request
      .post('/api/v1/my/messages')
      .send({ user_id: recipient.id })
      .expect(201)
    const path = `/api/v1/my/messages/${created.body.conversation.id as string}/messages`
    request.setClientInfo(clientHeaders)
    return { request, path }
  }

  it.each([
    ['web', {}],
    ['swift', { 'x-voucha-client': 'swift', 'x-voucha-platform': 'ios' }],
  ])('stores the %s client that sent the message and exposes none', async (client, headers) => {
    const { request, path } = await openThread(headers)

    const sent = await request
      .post(path)
      .send({ text: `Hello from ${client}` })
      .expect(201)

    await expect(
      readTestContentProvenance('conversation_messages', sent.body.message.id),
    ).resolves.toEqual({ createdVia: client, oauthClientId: null })
    expect(JSON.stringify(sent.body)).not.toMatch(/created_?via|oauth/i)
    const listed = await request.get(path).expect(200)
    expect(listed.body.results.map((message: { id: string }) => message.id)).toEqual([
      sent.body.message.id,
    ])
    expect(JSON.stringify(listed.body)).not.toMatch(/created_?via|oauth/i)
  })

  it('rejects a message whose client information is invalid and stores nothing', async () => {
    const { request, path } = await openThread({ 'x-voucha-client': 'unclassified-client' })

    const response = await request.post(path).send({ text: 'Hello' }).expect(400)

    expect(response.body.code).toBe('INVALID_CLIENT_INFO')
    request.setClientInfo({ 'x-voucha-client': 'web', 'x-voucha-platform': 'web' })
    const listed = await request.get(path).expect(200)
    expect(listed.body.results).toEqual([])
  })
})
