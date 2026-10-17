import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestDirectConversation,
  createTestDirectMessage,
  createTestUser,
  suspendTestUser,
} from '@voucha/test-helpers'
import { issueTestOAuthTokens } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'

function callTool(token: string, name: string, option: string, args: Record<string, unknown>) {
  return createRequest()
    .post('/api/v1/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: optionArgs(option, args) },
    })
}

describe('suspended Free member direct messages over OAuth MCP — real DB', () => {
  it('reads only own DMs and rejects message writes and appeal reads', async () => {
    const owner = await createTestUser()
    const peer = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: owner.id, user2Id: peer.id })
    const message = await createTestDirectMessage({
      conversationId: conversation.id,
      createdById: peer.id,
      bodyText: 'Read while suspended',
    })
    const { access_token: token } = await issueTestOAuthTokens(owner, {
      scope: 'messages:read messages:write appeals:read',
    })
    await suspendTestUser(owner.id)

    const rest = createRequest()
    await rest.authenticateAs(owner)
    const restRead = await rest.get(`/api/v1/my/messages/${conversation.id}/messages`).expect(200)
    expect(restRead.body.results.map((row: { id: string }) => row.id)).toContain(message.id)

    const read = await callTool(token, 'read_my_messages', 'messages', {
      conversation_id: conversation.id,
    }).expect(200)
    expect(read.body.result?.isError).toBeUndefined()
    expect(read.body.result?.structuredContent?.results).toEqual([
      expect.objectContaining({
        id: message.id,
        body_text: expect.stringContaining('Read while suspended'),
      }),
    ])

    for (const [name, option, args] of [
      ['manage_my_messages', 'send', { conversation_id: conversation.id, text: 'denied' }],
      ['read_my_moderation_appeals', 'list', {}],
    ] as const) {
      const denial = await callTool(token, name, option, args).expect(200)
      expect(denial.body.error).toMatchObject({
        code: -32600,
        message: expect.stringContaining('suspended'),
      })
    }
    const after = await rest.get(`/api/v1/my/messages/${conversation.id}/messages`).expect(200)
    expect(after.body.results.map((row: { id: string }) => row.id)).toEqual([message.id])
  })
})
