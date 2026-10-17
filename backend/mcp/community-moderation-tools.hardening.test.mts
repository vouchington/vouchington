import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'

const options = [
  'list_applications',
  'list_automod_actions',
  'list_bans',
  'list_invites',
  'read_moderation_analytics',
  'read_moderator_stats',
  'read_moderator_vacation',
  'read_modlog',
  'list_pending_posts',
  'list_pending_reports',
  'list_restrictions',
  'list_saved_replies',
] as const

describe('community moderation MCP read options — real PostgreSQL and Valkey', () => {
  it.each(options)('validates the %s success schema and refuses members', async option => {
    const owner = await createTestPlusMcpCaller()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    const args = optionArgs(option, { community: community.slug })
    const scopes = ['community-moderation:read'] as const

    const result = await callStructuredMcpTool(
      { ...owner, membership_plan: null },
      'read_community_moderation',
      args,
      scopes,
    )
    expect(result).toEqual(expect.any(Object))
    expect(
      await callRejectedMcpTool(
        { ...member, membership_plan: null },
        'read_community_moderation',
        args,
        scopes,
      ),
    ).toContain('Forbidden')
  })
})
