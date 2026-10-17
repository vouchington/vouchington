import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestDirectConversation,
  createTestGroupConversation,
  createTestUser,
  insertTestBlock,
  setTestUserDirectMessagesAudience,
  suspendTestUser,
} from '@voucha/test-helpers'
import {
  callRejectedMcpTool,
  optionArgs,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'

const READ = ['messages:read'] as const
const WRITE = ['messages:read', 'messages:write'] as const
const plus = (user: Awaited<ReturnType<typeof createTestUser>>): McpContractCaller => ({
  ...user,
  membership_plan: 'plus',
})
async function rejectedWrite(
  user: McpContractCaller,
  option: string,
  args: Record<string, unknown>,
  error: { status: number; message?: string },
) {
  const text = await callRejectedMcpTool(
    user,
    'manage_my_messages',
    optionArgs(option, args),
    WRITE,
  )
  expect(JSON.parse(text)).toMatchObject({ error })
}

describe('manage_my_messages guards — real DB', () => {
  it('rejects recipient refusal, blocked pairs, and sending after the block', async () => {
    expect.hasAssertions()
    const owner = plus(await createTestUser())
    const closed = await createTestUser()
    await setTestUserDirectMessagesAudience(closed.id, 'nobody')
    await rejectedWrite(
      owner,
      'create',
      {
        user_id: closed.id,
      },
      { status: 403, message: 'You cannot send messages to this user' },
    )

    const peer = await createTestUser()
    await setTestUserDirectMessagesAudience(peer.id, 'everyone')
    const conversation = await createTestDirectConversation({ user1Id: owner.id, user2Id: peer.id })
    await insertTestBlock(peer.id, owner.id)
    await rejectedWrite(
      owner,
      'send',
      {
        conversation_id: conversation.id,
        text: 'blocked',
      },
      { status: 403, message: 'Access denied' },
    )
    await rejectedWrite(
      owner,
      'create',
      {
        user_id: peer.id,
      },
      { status: 403, message: 'You cannot send messages to this user' },
    )
  })

  it('enforces owner, membership, self-add, duplicate, and suspension guards', async () => {
    expect.hasAssertions()
    const owner = plus(await createTestUser())
    const peer = plus(await createTestUser())
    const outsider = plus(await createTestUser())
    const conversation = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [peer.id],
    })
    const target = await createTestUser()
    await setTestUserDirectMessagesAudience(target.id, 'everyone')
    const check = (
      user: McpContractCaller,
      option: string,
      args: Record<string, unknown>,
      status: number,
    ) => rejectedWrite(user, option, args, { status })

    await check(
      peer,
      'update',
      { conversation_id: conversation.id, participant_add_policy: 'all_members' },
      403,
    )
    await check(
      peer,
      'add_participant',
      { conversation_id: conversation.id, user_id: target.id },
      403,
    )
    await check(
      outsider,
      'remove_participant',
      { conversation_id: conversation.id, user_id: peer.id },
      403,
    )
    await check(
      owner,
      'add_participant',
      { conversation_id: conversation.id, user_id: owner.id },
      400,
    )
    await check(
      owner,
      'add_participant',
      { conversation_id: conversation.id, user_id: peer.id },
      409,
    )
    await check(
      owner,
      'remove_participant',
      { conversation_id: conversation.id, user_id: owner.id },
      403,
    )
    await check(
      peer,
      'remove_participant',
      { conversation_id: conversation.id, user_id: owner.id },
      403,
    )
    await suspendTestUser(owner.id)
    await check(owner, 'send', { conversation_id: conversation.id, text: 'no send' }, 403)
  })

  it('rejects malformed envelopes and semantic blank text without a write', async () => {
    const ownerUser = await createTestUser()
    const owner = plus(ownerUser)
    const peer = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: owner.id, user2Id: peer.id })
    for (const args of [
      optionArgs('create', { user_id: peer.id, user_ids: [peer.id] }),
      optionArgs('create', { user_ids: [] }),
      optionArgs('send', { conversation_id: conversation.id, text: 'hello', user_id: peer.id }),
      { ...optionArgs('send', { conversation_id: conversation.id, text: 'hello' }), extra: true },
      optionArgs('remove_participant', { conversation_id: conversation.id, user_id: 'bad' }),
    ]) {
      expect(await callRejectedMcpTool(owner, 'manage_my_messages', args, WRITE)).toContain(
        'Invalid tool arguments',
      )
    }
    await rejectedWrite(
      owner,
      'send',
      {
        conversation_id: conversation.id,
        text: '  ',
      },
      { status: 400, message: 'text is required' },
    )
    const request = createRequest()
    await request.authenticateAs(ownerUser)
    expect(
      (await request.get(`/api/v1/my/messages/${conversation.id}/messages`).expect(200)).body
        .results,
    ).toEqual([])
  })

  it('rejects the same oversized UTF-8 message body as REST without persisting it', async () => {
    const owner = plus(await createTestUser())
    const peer = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: owner.id, user2Id: peer.id })
    const text = 'é'.repeat(5121)
    await rejectedWrite(
      owner,
      'send',
      { conversation_id: conversation.id, text },
      { status: 413, message: 'Request entity too large' },
    )
    const rest = createRequest()
    await rest.authenticateAs(owner)
    const route = `/api/v1/my/messages/${conversation.id}/messages`
    await rest.post(route).send({ text }).expect(413)
    expect((await rest.get(route).expect(200)).body.results).toEqual([])
  })

  it('requires Plus and both exact message scopes for writes', async () => {
    const free = await createTestUser()
    const peer = await createTestUser()
    const conversation = await createTestDirectConversation({ user1Id: free.id, user2Id: peer.id })
    const args = optionArgs('send', { conversation_id: conversation.id, text: 'no' })
    expect(
      await callRejectedMcpTool(
        { ...free, membership_plan: null },
        'manage_my_messages',
        args,
        WRITE,
      ),
    ).toContain('plan')
    for (const scopes of [[], READ, ['mcp.user:read', 'mcp.user:write'] as const]) {
      expect(await callRejectedMcpTool(plus(free), 'manage_my_messages', args, scopes)).toContain(
        'scope',
      )
    }
  })
})
