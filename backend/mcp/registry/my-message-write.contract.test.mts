import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestDirectConversation,
  createTestGroupConversation,
  createTestUser,
  getTestConversationParticipants,
  setTestUserDirectMessagesAudience,
} from '@voucha/test-helpers'
import {
  callStructuredMcpTool,
  optionArgs,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'

const WRITE = ['messages:read', 'messages:write'] as const
const plus = (user: Awaited<ReturnType<typeof createTestUser>>): McpContractCaller => ({
  ...user,
  membership_plan: 'plus',
})
const writeMessages = (user: McpContractCaller, option: string, args: Record<string, unknown>) =>
  callStructuredMcpTool(user, 'manage_my_messages', optionArgs(option, args), WRITE)
describe('manage_my_messages REST twins — real DB', () => {
  it('creates a direct conversation with the REST recipient rule', async () => {
    const restSender = await createTestUser()
    const toolSender = await createTestUser()
    const recipient = await createTestUser()
    await setTestUserDirectMessagesAudience(recipient.id, 'everyone')
    const request = createRequest()
    await request.authenticateAs(restSender)
    const rest = await request
      .post('/api/v1/my/messages')
      .send({ user_id: recipient.id })
      .expect(201)
    const tool = await writeMessages(plus(toolSender), 'create', { user_id: recipient.id })
    expect(tool.conversation).toMatchObject({
      channel_type: rest.body.conversation.channel_type,
      created_by_id: toolSender.id,
    })
    expect((tool.conversation as { id: string }).id).not.toBe(rest.body.conversation.id)
    const second = await writeMessages(plus(toolSender), 'create', { user_id: recipient.id })
    expect((second.conversation as { id: string }).id).toBe(
      (tool.conversation as { id: string }).id,
    )
  })

  it('creates a group from the same recipient array REST accepts', async () => {
    const restSender = await createTestUser()
    const toolSender = await createTestUser()
    const first = await createTestUser()
    const second = await createTestUser()
    await Promise.all(
      [first, second].map(user => setTestUserDirectMessagesAudience(user.id, 'everyone')),
    )
    const request = createRequest()
    await request.authenticateAs(restSender)
    const rest = await request
      .post('/api/v1/my/messages')
      .send({ user_ids: [first.id, second.id] })
      .expect(201)
    const tool = await writeMessages(plus(toolSender), 'create', {
      user_ids: [first.id, second.id],
    })
    expect(tool.conversation).toMatchObject({
      channel_type: rest.body.conversation.channel_type,
      created_by_id: toolSender.id,
    })
    expect(
      (await getTestConversationParticipants((tool.conversation as { id: string }).id)).map(
        row => row.user_id,
      ),
    ).toEqual(expect.arrayContaining([toolSender.id, first.id, second.id]))
  })

  it('updates participant policy like REST', async () => {
    const owner = await createTestUser()
    const peer = await createTestUser()
    const restConversation = await createTestDirectConversation({
      user1Id: owner.id,
      user2Id: peer.id,
    })
    const toolConversation = await createTestDirectConversation({
      user1Id: owner.id,
      user2Id: peer.id,
    })
    const request = createRequest()
    await request.authenticateAs(owner)
    const rest = await request
      .patch(`/api/v1/my/messages/${restConversation.id}`)
      .send({ participant_add_policy: 'all_members' })
      .expect(200)
    const tool = await writeMessages(plus(owner), 'update', {
      conversation_id: toolConversation.id,
      participant_add_policy: 'all_members',
    })
    expect(tool).toEqual(rest.body)
    const readback = await request.get(`/api/v1/my/messages/${toolConversation.id}`).expect(200)
    expect(readback.body.conversation.participant_add_policy).toBe('all_members')
  })

  it('sends a persisted message with the REST author and fenced text', async () => {
    const owner = await createTestUser()
    const peer = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: owner.id, user2Id: peer.id })
    const request = createRequest()
    await request.authenticateAs(owner)
    const route = `/api/v1/my/messages/${conversation.id}/messages`
    const rest = await request.post(route).send({ text: 'REST twin' }).expect(201)
    const tool = await writeMessages(plus(owner), 'send', {
      conversation_id: conversation.id,
      text: 'MCP twin',
    })
    const message = tool.message as { id: string; body_text: string; created_by_id: string }
    expect(message.created_by_id).toBe(rest.body.message.created_by_id)
    expect(message.body_text).toContain('MCP twin')
    expect(message.body_text).toMatch(/^<external-content /)
    const readback = await request.get(route).expect(200)
    expect(readback.body.results.map((row: { id: string }) => row.id)).toContain(message.id)
  })

  it('adds a participant with REST-equivalent membership', async () => {
    const owner = await createTestUser()
    const peer = await createTestUser()
    const restNew = await createTestUser()
    const toolNew = await createTestUser()
    await Promise.all(
      [restNew, toolNew].map(user => setTestUserDirectMessagesAudience(user.id, 'everyone')),
    )
    const restConversation = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [peer.id],
    })
    const toolConversation = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [peer.id],
    })
    const request = createRequest()
    await request.authenticateAs(owner)
    const rest = await request
      .post(`/api/v1/my/messages/${restConversation.id}/participants`)
      .send({ user_id: restNew.id })
      .expect(201)
    const tool = await writeMessages(plus(owner), 'add_participant', {
      conversation_id: toolConversation.id,
      user_id: toolNew.id,
    })
    expect(tool.participant).toMatchObject({
      role: rest.body.participant.role,
      user_id: toolNew.id,
      conversation_id: toolConversation.id,
    })
    expect(await getTestConversationParticipants(toolConversation.id)).toContainEqual({
      user_id: toolNew.id,
      role: 'member',
    })
  })

  it('removes a participant with REST-equivalent membership', async () => {
    const owner = await createTestUser()
    const restPeer = await createTestUser()
    const toolPeer = await createTestUser()
    const restConversation = await createTestDirectConversation({
      user1Id: owner.id,
      user2Id: restPeer.id,
    })
    const toolConversation = await createTestDirectConversation({
      user1Id: owner.id,
      user2Id: toolPeer.id,
    })
    const request = createRequest()
    await request.authenticateAs(owner)
    await request
      .delete(`/api/v1/my/messages/${restConversation.id}/participants/${restPeer.id}`)
      .expect(204)
    expect(
      await writeMessages(plus(owner), 'remove_participant', {
        conversation_id: toolConversation.id,
        user_id: toolPeer.id,
      }),
    ).toEqual({ success: true })
    expect(
      (await getTestConversationParticipants(restConversation.id)).some(
        row => row.user_id === restPeer.id,
      ),
    ).toBe(false)
    expect(
      (await getTestConversationParticipants(toolConversation.id)).some(
        row => row.user_id === toolPeer.id,
      ),
    ).toBe(false)
  })
})
