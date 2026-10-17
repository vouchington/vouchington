import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityInvite,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'

const scopes = ['community-moderation:read'] as const

describe('community moderation MCP list reads — real PostgreSQL and Valkey', () => {
  it('lists email invites without exposing their bearer codes', async () => {
    const owner = await createTestPlusMcpCaller()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    const email = `invite-${crypto.randomUUID()}@example.test`
    const invite = await insertTestCommunityInvite({
      communityId: community.id,
      invitedById: owner.id,
      invitedEmail: email,
    })
    const args = optionArgs('list_invites', { community: community.slug })

    expect(
      await callRejectedMcpTool(
        { ...member, membership_plan: null },
        'read_community_moderation',
        args,
        scopes,
      ),
    ).toContain('Forbidden')
    const page = await callStructuredMcpTool(owner, 'read_community_moderation', args, scopes)
    expect(page.results).toEqual([{ __entity_type: 'community_invite', id: invite.id }])
    expect(page.community_invites).toMatchObject({
      [invite.id]: { id: invite.id, community_id: community.id, invited_email: email },
    })
    expect(
      (page.community_invites as Record<string, Record<string, unknown>>)[invite.id],
    ).not.toHaveProperty('code')
    expect(
      (page.community_invites as Record<string, Record<string, unknown>>)[invite.id],
    ).not.toHaveProperty('code_hash')
    expect(page.community_invites).toMatchObject({
      [invite.id]: { __entity_type: 'community_invite' },
    })
    expect(JSON.stringify(page)).not.toContain(invite.code)
  })
})
