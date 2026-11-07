import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getTestActiveCommunityBan,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
const READ = 'read_community_moderation'
const REMOVE = 'remove_community_moderation'
const READ_SCOPES = ['community-moderation:read'] as const
const WRITE_SCOPES = ['community-moderation:read', 'community-moderation:write'] as const
async function communityFixture() {
  const owner = await createTestPlusMcpCaller()
  const member = await createTestUser()
  const outsider = await createTestUser()
  const community = await insertTestCommunity({ createdById: owner.id })
  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  return { owner, member, outsider, community }
}
async function errorOf(
  caller: Awaited<ReturnType<typeof createTestUser>>,
  tool: string,
  option: string,
  args: Record<string, unknown>,
  scopes: typeof READ_SCOPES,
) {
  return callRejectedMcpTool(
    { ...caller, membership_plan: caller.membership_plan ?? null },
    tool,
    optionArgs(option, args),
    scopes,
  )
}
describe('community moderation bans MCP', () => {
  it('reads active ban summaries and details, then lifts all for the target', async () => {
    const { owner, member, outsider, community } = await communityFixture()
    const first = await insertTestCommunityBan({
      communityId: community.id,
      userId: member.id,
      bannedById: owner.id,
      reason: 'first reason',
    })
    const second = await insertTestCommunityBan({
      communityId: community.id,
      userId: member.id,
      bannedById: owner.id,
      reason: 'second reason',
    })
    const args = { community: community.id, userId: member.id }
    const page = await callStructuredMcpTool(
      owner,
      READ,
      optionArgs('list_active_bans', args),
      READ_SCOPES,
    )
    expect(page).toMatchObject({
      community_bans: { [first.id]: { id: first.id }, [second.id]: { id: second.id } },
    })
    expect(JSON.stringify(page)).not.toContain('first reason')
    const detail = await callStructuredMcpTool(
      owner,
      READ,
      optionArgs('read_ban', { community: community.id, banId: first.id }),
      READ_SCOPES,
    )
    expect(JSON.stringify(detail)).toContain('first reason')
    expect(
      await errorOf(
        outsider,
        READ,
        'read_ban',
        { community: community.id, banId: first.id },
        READ_SCOPES,
      ),
    ).toContain('Forbidden')
    const lifted = await callStructuredMcpTool(
      owner,
      REMOVE,
      optionArgs('lift_all_bans', args),
      WRITE_SCOPES,
    )
    expect(lifted).toMatchObject({
      community_id: community.id,
      user_id: member.id,
      lifted_ban_ids: expect.arrayContaining([first.id, second.id]),
    })
    expect(await getTestActiveCommunityBan(community.id, member.id)).toBeNull()
  })
})
