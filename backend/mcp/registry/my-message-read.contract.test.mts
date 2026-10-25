import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getRegisteredToolByName } from '@voucha/mcp/registry/index'
import { findSchemaViolation } from '@vouchington/mcp-server/schema'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestDirectConversation,
  createTestDirectMessage,
  createTestUser,
  removeTestConversationParticipant,
} from '@voucha/test-helpers'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  expectMcpToolFunctionThrows,
  optionArgs,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'

const READ = ['messages:read'] as const
const broad = ['mcp.user:read', 'mcp.user:write'] as const
const caller = (user: Awaited<ReturnType<typeof createTestUser>>): McpContractCaller => ({
  ...user,
  membership_plan: null,
})
const readMessages = (user: McpContractCaller, option: string, args: Record<string, unknown>) =>
  callStructuredMcpTool(user, 'read_my_messages', optionArgs(option, args), READ)

describe('read_my_messages REST twins — real DB', () => {
  it('lists only the caller’s DM conversations with the REST cursor', async () => {
    const owner = await createTestUser()
    const other = await createTestUser()
    const first = await createTestDirectConversation({ user1Id: owner.id, user2Id: other.id })
    const secondPeer = await createTestUser()
    const second = await createTestDirectConversation({ user1Id: owner.id, user2Id: secondPeer.id })
    const request = createRequest()
    await request.authenticateAs(owner)

    const rest = await request.get('/api/v1/my/messages').query({ limit: 1 }).expect(200)
    const tool = await readMessages(caller(owner), 'list', { limit: 1 })
    expect(tool.results).toEqual(rest.body.results)
    expect(tool.page_info).toEqual(rest.body.page_info)
    expect([first.id, second.id]).toContain((tool.results as Array<{ id: string }>)[0]?.id)
    const after = (tool.page_info as { end_cursor: string }).end_cursor
    const restNext = await request.get('/api/v1/my/messages').query({ limit: 1, after }).expect(200)
    const toolNext = await readMessages(caller(owner), 'list', { limit: 1, after })
    expect(toolNext.results).toEqual(restNext.body.results)
    expect(toolNext.page_info).toEqual(restNext.body.page_info)
  })

  it('gets exactly the active participant’s conversation', async () => {
    const owner = await createTestUser()
    const peer = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: owner.id, user2Id: peer.id })
    const request = createRequest()
    await request.authenticateAs(owner)
    const rest = await request.get(`/api/v1/my/messages/${conversation.id}`).expect(200)

    expect(await readMessages(caller(owner), 'get', { conversation_id: conversation.id })).toEqual(
      rest.body,
    )
    const schema = getRegisteredToolByName('read_my_messages')!.meta!.selectOutputSchema!(
      optionArgs('get', { conversation_id: conversation.id }),
    )!
    const withoutPolicy = { ...rest.body.conversation }
    delete withoutPolicy.participant_add_policy
    expect(findSchemaViolation(schema, { conversation: withoutPolicy })).not.toBeNull()
  })

  it('pages messages like REST and fences member-authored text', async () => {
    const owner = await createTestUser()
    const peer = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: owner.id, user2Id: peer.id })
    await createTestDirectMessage({
      conversationId: conversation.id,
      createdById: peer.id,
      bodyText: 'first message',
    })
    await createTestDirectMessage({
      conversationId: conversation.id,
      createdById: peer.id,
      bodyText: 'second message',
    })
    const request = createRequest()
    await request.authenticateAs(owner)
    const route = `/api/v1/my/messages/${conversation.id}/messages`
    const rest = await request.get(route).query({ limit: 1 }).expect(200)
    const tool = await readMessages(caller(owner), 'messages', {
      conversation_id: conversation.id,
      limit: 1,
    })
    const [message] = tool.results as Array<{ id: string; body_text: string }>
    expect(message?.id).toBe(rest.body.results[0]?.id)
    expect(message?.body_text).toContain(rest.body.results[0]?.body_text)
    expect(message?.body_text).toMatch(/^<external-content /)
    expect(tool.page_info).toEqual(rest.body.page_info)

    const after = (tool.page_info as { end_cursor: string }).end_cursor
    const restNext = await request.get(route).query({ limit: 1, after }).expect(200)
    const toolNext = await readMessages(caller(owner), 'messages', {
      conversation_id: conversation.id,
      limit: 1,
      after,
    })
    expect((toolNext.results as Array<{ id: string }>).map(row => row.id)).toEqual(
      restNext.body.results.map((row: { id: string }) => row.id),
    )
    expect(toolNext.page_info).toEqual(restNext.body.page_info)
  })

  it('pages active participants with the REST cursor', async () => {
    const owner = await createTestUser()
    const peer = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: owner.id, user2Id: peer.id })
    const request = createRequest()
    await request.authenticateAs(owner)
    const route = `/api/v1/my/messages/${conversation.id}/participants`
    const rest = await request.get(route).query({ limit: 1 }).expect(200)
    const tool = await readMessages(caller(owner), 'participants', {
      conversation_id: conversation.id,
      limit: 1,
    })
    expect(tool.results).toEqual(rest.body.results)
    expect(tool.page_info).toEqual(rest.body.page_info)
    const after = (tool.page_info as { end_cursor: string }).end_cursor
    const restNext = await request.get(route).query({ limit: 1, after }).expect(200)
    const toolNext = await readMessages(caller(owner), 'participants', {
      conversation_id: conversation.id,
      limit: 1,
      after,
    })
    expect(toolNext.results).toEqual(restNext.body.results)
    expect(toolNext.page_info).toEqual(restNext.body.page_info)
  })

  it('denies strangers and former participants across private read options', async () => {
    const owner = await createTestUser()
    const peer = await createTestUser()
    const stranger = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: owner.id, user2Id: peer.id })
    await removeTestConversationParticipant(conversation.id, peer.id)

    for (const user of [caller(peer), caller(stranger)]) {
      expect((await readMessages(user, 'list', {})).results).toEqual([])
      for (const option of ['get', 'messages', 'participants']) {
        await expectMcpToolFunctionThrows(
          user,
          'read_my_messages',
          optionArgs(option, { conversation_id: conversation.id }),
          { status: 403, message: 'Access denied' },
        )
      }
    }
  })

  it('rejects malformed cursors, malformed IDs, and unknown fields', async () => {
    const owner = caller(await createTestUser())
    const peer = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: owner.id, user2Id: peer.id })
    await expectMcpToolFunctionThrows(
      owner,
      'read_my_messages',
      optionArgs('list', { after: 'invalid' }),
      { status: 400, message: 'Invalid conversation cursor' },
    )
    for (const option of ['messages', 'participants']) {
      await expectMcpToolFunctionThrows(
        owner,
        'read_my_messages',
        optionArgs(option, { conversation_id: conversation.id, after: 'invalid' }),
        { status: 400 },
      )
    }
    expect(
      await callRejectedMcpTool(
        owner,
        'read_my_messages',
        optionArgs('get', { conversation_id: 'invalid' }),
        READ,
      ),
    ).toContain('Invalid tool arguments')
    for (const args of [
      { option: 'get', arguments: { conversation_id: conversation.id }, user_id: randomUUID() },
      optionArgs('get', { conversation_id: conversation.id, user_id: randomUUID() }),
      optionArgs('messages', { conversation_id: conversation.id, limit: '1' }),
    ]) {
      expect(await callRejectedMcpTool(owner, 'read_my_messages', args, READ)).toContain(
        'Invalid tool arguments',
      )
    }
  })

  it.each(['list', 'messages', 'participants'])(
    '%s uses REST defaults and clamps limits',
    async option => {
      const owner = await createTestUser()
      const peer = await createTestUser()
      const conversation = await createTestDirectConversation({
        user1Id: owner.id,
        user2Id: peer.id,
      })
      await createTestDirectMessage({
        conversationId: conversation.id,
        createdById: peer.id,
        bodyText: 'Bounded page',
      })
      const request = createRequest()
      await request.authenticateAs(owner)
      const route =
        option === 'list'
          ? '/api/v1/my/messages'
          : `/api/v1/my/messages/${conversation.id}/${option}`
      const args = option === 'list' ? {} : { conversation_id: conversation.id }
      for (const query of [{}, { limit: 1 }, { limit: 10000 }]) {
        const rest = await request.get(route).query(query).expect(200)
        const tool = await readMessages(caller(owner), option, { ...args, ...query })
        expect((tool.results as Array<{ id: string }>).map(row => row.id)).toEqual(
          rest.body.results.map((row: { id: string }) => row.id),
        )
        expect(tool.page_info).toEqual(rest.body.page_info)
      }
      await request.get(route).query({ limit: 0 }).expect(400)
      const rejection = await callRejectedMcpTool(
        caller(owner),
        'read_my_messages',
        optionArgs(option, { ...args, limit: 0 }),
        READ,
      )
      expect(JSON.parse(rejection)).toMatchObject({ error: { status: 400 } })
    },
  )

  it('keeps DM reads behind the exact read grant', async () => {
    const owner = caller(await createTestUser())
    for (const scopes of [[], broad]) {
      expect(
        await callRejectedMcpTool(owner, 'read_my_messages', optionArgs('list'), scopes),
      ).toContain('scope')
    }
    expect((await readMessages(owner, 'list', {})).results).toEqual([])
  })
})
