import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { describe, expect, it } from 'vitest'
import { getCommunityOrThrow } from '@services/communities'
import { createTestUser } from '@voucha/test-helpers'
import {
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers/entities/communities'
import { getTestActiveCommunityBan } from '@voucha/test-helpers/entities/community-bans'
import {
  sdkCommunityModerationCase,
  connectSdkCatalog,
  callAndValidateSdkTool,
} from '@voucha/test-helpers/mcp-sdk-catalog'
import { sdkMergedSuccessNames } from '@voucha/test-helpers/mcp-sdk-success-names'

describe('registered community moderation catalog SDK', () => {
  it('executes all four merged tools against owned community fixtures', async () => {
    const owner = await createTestUser()
    const target = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const client = await connectSdkCatalog(
      sdkCommunityModerationCase,
      owner,
      async (url, fetch) => {
        const sdk = new Client({ name: 'voucha-community-moderation-test', version: '1.0.0' })
        await sdk.connect(new StreamableHTTPClientTransport(url, { fetch }))
        return sdk
      },
    )
    const observed = new Set<string>()
    const call = async (name: string, option: string, args: Record<string, unknown>) => {
      const result = await callAndValidateSdkTool(client, name, option, {
        community: community.id,
        ...args,
      })
      observed.add(name)
      return result
    }
    try {
      const listing = await client.listTools()
      expect(listing.tools.map(tool => tool.name).toSorted()).toEqual(
        [...sdkMergedSuccessNames.communityModerationFixture].toSorted(),
      )
      await call('add_community_moderation', 'ban_user', {
        user_id: target.id,
        reason: 'SDK fixture moderation',
      })
      const ban = await getTestActiveCommunityBan(community.id, target.id)
      expect(ban).toMatchObject({
        user_id: target.id,
        banned_by_id: owner.id,
      })
      const bans = await call('read_community_moderation', 'list_bans', {})
      expect(bans).toMatchObject({
        community_bans: {
          [ban!.id]: expect.objectContaining({ user_id: target.id }),
        },
      })
      const modlog = await call('read_community_moderation', 'read_modlog', {})
      expect(modlog.results).toEqual(expect.arrayContaining([expect.any(Object)]))
      const name = `SDK community ${crypto.randomUUID()}`
      await call('update_community_moderation', 'update_community_settings', { name })
      expect((await getCommunityOrThrow(community.id)).name).toBe(name)
      await call('remove_community_moderation', 'lift_ban', { userId: target.id })
      expect(await getTestActiveCommunityBan(community.id, target.id)).toBeNull()
      expect([...observed].toSorted()).toEqual(
        [...sdkMergedSuccessNames.communityModerationFixture].toSorted(),
      )
    } finally {
      await client.close()
    }
  })
})
