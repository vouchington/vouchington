import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  getTestConversationThreadFields,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { openModmailThread } from '@services/modmail'

const scopes = ['community-moderation:read', 'community-moderation:write'] as const
const tool = 'update_community_moderation'

describe('community moderator modmail updates through MCP', () => {
  it('assigns, resolves, reopens, and rejects reopening beside another open subject thread', async () => {
    const owner = await createTestPlusMcpCaller()
    const moderator = await createTestUser()
    const subject = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    const thread = await openModmailThread(subject.id, community.id, subject.id)
    const base = { community: community.id, conversationId: thread.id }
    const resolved = await callStructuredMcpTool(
      owner,
      tool,
      optionArgs('update_modmail_thread', {
        ...base,
        assigned_moderator_user_id: moderator.id,
        resolved: true,
      }),
      scopes,
    )
    expect(resolved.thread).toMatchObject({
      id: thread.id,
      assigned_moderator_user_id: moderator.id,
      resolved_by_id: owner.id,
      resolved_at: expect.any(String),
    })
    expect(await getTestConversationThreadFields(thread.id)).toMatchObject({
      assigned_moderator_user_id: moderator.id,
      resolved_by_id: owner.id,
      resolved_at: expect.any(Date),
    })
    const reopened = await callStructuredMcpTool(
      owner,
      tool,
      optionArgs('update_modmail_thread', { ...base, resolved: false }),
      scopes,
    )
    expect(reopened.thread).toMatchObject({ resolved_at: null, resolved_by_id: null })
    expect(await getTestConversationThreadFields(thread.id)).toMatchObject({
      resolved_at: null,
      resolved_by_id: null,
    })
    await callStructuredMcpTool(
      owner,
      tool,
      optionArgs('update_modmail_thread', { ...base, resolved: true }),
      scopes,
    )
    const competing = await openModmailThread(subject.id, community.id, subject.id)
    expect(competing.id).not.toBe(thread.id)
    expect(
      await callRejectedMcpTool(
        owner,
        tool,
        optionArgs('update_modmail_thread', { ...base, resolved: false }),
        scopes,
      ),
    ).toContain('Another open thread already exists for this subject')
    expect(await getTestConversationThreadFields(thread.id)).toMatchObject({
      resolved_at: expect.any(Date),
      resolved_by_id: owner.id,
    })
    expect(await getTestConversationThreadFields(competing.id)).toMatchObject({ resolved_at: null })
  })

  it('rejects member access and assignment to a regular member without changing the thread', async () => {
    const owner = await createTestPlusMcpCaller()
    const member = await createTestPlusMcpCaller()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    const thread = await openModmailThread(member.id, community.id, member.id)
    const base = { community: community.id, conversationId: thread.id }
    expect(
      await callRejectedMcpTool(
        member,
        tool,
        optionArgs('update_modmail_thread', { ...base, resolved: true }),
        scopes,
      ),
    ).toContain('Forbidden')
    expect(
      await callRejectedMcpTool(
        owner,
        tool,
        optionArgs('update_modmail_thread', {
          ...base,
          assigned_moderator_user_id: member.id,
          resolved: true,
        }),
        scopes,
      ),
    ).toContain('assigned_moderator_user_id must be an active owner or moderator')
    expect(await getTestConversationThreadFields(thread.id)).toMatchObject({
      assigned_moderator_user_id: null,
      resolved_at: null,
      resolved_by_id: null,
    })
  })
})
