import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
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
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { communitiesWorkConfig } from '@services/communities/work-limits'
import { getCommunityBanById } from '../communities/bans/get.mts'
import {
  COMMUNITY_BAN_LIFT_ALL_FORBIDDEN,
  COMMUNITY_BAN_LIFT_ALL_LIMIT_REACHED,
} from '@modules/on-error/error-codes'

const scopes = ['community-moderation:read', 'community-moderation:write'] as const

describe('community ban lift MCP error transport', () => {
  it('preserves the protected-issuer code and lets a moderator lift their own ban individually', async () => {
    const [owner, moderator, target] = await Promise.all([
      createTestPlusMcpCaller(),
      createTestPlusMcpCaller(),
      createTestUser(),
    ])
    const community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])
    const protectedBan = await insertTestCommunityBan({
      communityId: community.id,
      userId: target.id,
      bannedById: owner.id,
    })
    const ownBan = await insertTestCommunityBan({
      communityId: community.id,
      userId: target.id,
      bannedById: moderator.id,
    })
    const result = JSON.parse(
      await callRejectedMcpTool(
        moderator,
        'remove_community_moderation',
        optionArgs('lift_all_bans', { community: community.id, userId: target.id }),
        scopes,
      ),
    )
    expect(result).toMatchObject({
      error: { status: 403, code: COMMUNITY_BAN_LIFT_ALL_FORBIDDEN, retryable: false },
    })
    expect((await getCommunityBanById(protectedBan.id))?.lifted_at).toBeNull()
    expect((await getCommunityBanById(ownBan.id))?.lifted_at).toBeNull()
    expect(
      await callStructuredMcpTool(
        moderator,
        'remove_community_moderation',
        optionArgs('lift_ban', { community: community.id, banId: ownBan.id }),
        scopes,
      ),
    ).toMatchObject({ lifted_ban_ids: [ownBan.id] })
    expect((await getCommunityBanById(protectedBan.id))?.lifted_at).toBeNull()
  })

  it('preserves the numeric overflow cap without mutating any ban', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communitiesWorkConfig, { lift_all_active_ban_limit: 1 }),
    )
    const owner = await createTestPlusMcpCaller()
    const target = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const first = await insertTestCommunityBan({
      communityId: community.id,
      userId: target.id,
      bannedById: owner.id,
    })
    const second = await insertTestCommunityBan({
      communityId: community.id,
      userId: target.id,
      bannedById: owner.id,
    })
    const result = JSON.parse(
      await callRejectedMcpTool(
        owner,
        'remove_community_moderation',
        optionArgs('lift_all_bans', { community: community.id, userId: target.id }),
        scopes,
      ),
    )
    expect(result).toMatchObject({
      error: { status: 409, code: COMMUNITY_BAN_LIFT_ALL_LIMIT_REACHED, cap: 1, retryable: false },
    })
    expect((await getCommunityBanById(first.id))?.lifted_at).toBeNull()
    expect((await getCommunityBanById(second.id))?.lifted_at).toBeNull()
  })
})
