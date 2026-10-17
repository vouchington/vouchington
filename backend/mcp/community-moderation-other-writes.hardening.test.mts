import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getTestActiveCommunityBan,
  getTestBanEvasionFlagState,
  insertTestCommunity,
  insertTestCommunityMember,
  setTestBanEvasionFlag,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  expectMcpToolFunctionThrows,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'

const WRITE_SCOPES = ['community-moderation:read', 'community-moderation:write'] as const

async function flagFixture() {
  const owner = await createTestPlusMcpCaller()
  const source = await createTestUser()
  const firstSuspect = await createTestUser()
  const secondSuspect = await createTestUser()
  const staff = await createTestPlusMcpCaller({ administrator: true })
  const community = await insertTestCommunity({ createdById: owner.id })
  await Promise.all([
    insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
    insertTestCommunityMember({ communityId: community.id, userId: source.id }),
    insertTestCommunityMember({ communityId: community.id, userId: firstSuspect.id }),
    insertTestCommunityMember({ communityId: community.id, userId: secondSuspect.id }),
  ])
  await Promise.all(
    [firstSuspect.id, secondSuspect.id].map(userId =>
      setTestBanEvasionFlag({
        communityId: community.id,
        userId,
        sourceUserId: source.id,
        score: 0.83,
      }),
    ),
  )
  return { owner, staff, source, firstSuspect, secondSuspect, community }
}

describe('community moderation MCP ban-evasion confirmation — REST twin and real PostgreSQL', () => {
  it('confirms a flagged member through MCP and the REST twin, recording the ban and resolution', async () => {
    const { staff, firstSuspect, secondSuspect, community } = await flagFixture()
    const rest = createRequest()
    await rest.authenticateAs(staff)
    await rest
      .post(`/api/v1/communities/${community.slug}/ban-evasion/${firstSuspect.id}`)
      .expect(204)
    expect(await getTestActiveCommunityBan(community.id, firstSuspect.id)).toMatchObject({
      user_id: firstSuspect.id,
      community_id: community.id,
      banned_by_id: staff.id,
    })
    expect(await getTestBanEvasionFlagState(community.id, firstSuspect.id)).toMatchObject({
      suspected_ban_evader_dismissed_by_id: staff.id,
      suspected_ban_evader_dismissed_at: expect.any(Date),
    })

    expect(
      await callStructuredMcpTool(
        staff,
        'add_community_moderation',
        optionArgs('confirm_ban_evasion', {
          community: community.slug,
          userId: secondSuspect.id,
        }),
        WRITE_SCOPES,
      ),
    ).toEqual({ success: true })
    await rest
      .post(`/api/v1/communities/${community.slug}/ban-evasion/${firstSuspect.id}`)
      .expect(422)
    await expectMcpToolFunctionThrows(
      staff,
      'add_community_moderation',
      optionArgs('confirm_ban_evasion', { community: community.slug, userId: secondSuspect.id }),
      { status: 422, message: 'No active ban-evasion flag found for this member' },
    )
    expect(await getTestActiveCommunityBan(community.id, secondSuspect.id)).toMatchObject({
      user_id: secondSuspect.id,
      community_id: community.id,
      banned_by_id: staff.id,
    })
    expect(await getTestBanEvasionFlagState(community.id, secondSuspect.id)).toMatchObject({
      suspected_ban_evader_dismissed_by_id: staff.id,
      suspected_ban_evader_dismissed_at: expect.any(Date),
    })
  })

  it('rejects a community owner and suspended staff without consuming the flag', async () => {
    const { owner, staff, firstSuspect, secondSuspect, community } = await flagFixture()
    const args = (userId: string) =>
      optionArgs('confirm_ban_evasion', { community: community.id, userId })

    const ownerRest = createRequest()
    await ownerRest.authenticateAs(owner)
    await ownerRest
      .post(`/api/v1/communities/${community.id}/ban-evasion/${firstSuspect.id}`)
      .expect(403)
    expect(
      await callRejectedMcpTool(
        owner,
        'add_community_moderation',
        args(firstSuspect.id),
        WRITE_SCOPES,
      ),
    ).toContain('Forbidden')
    expect(await getTestActiveCommunityBan(community.id, firstSuspect.id)).toBeNull()
    expect(await getTestBanEvasionFlagState(community.id, firstSuspect.id)).toMatchObject({
      suspected_ban_evader_dismissed_at: null,
      suspected_ban_evader_dismissed_by_id: null,
    })

    await suspendTestUser(staff.id)
    try {
      const suspendedRest = createRequest()
      await suspendedRest.authenticateAs(staff)
      await suspendedRest
        .post(`/api/v1/communities/${community.id}/ban-evasion/${secondSuspect.id}`)
        .expect(403)
      expect(
        await callRejectedMcpTool(
          staff,
          'add_community_moderation',
          args(secondSuspect.id),
          WRITE_SCOPES,
        ),
      ).toContain('suspended')
      expect(await getTestActiveCommunityBan(community.id, secondSuspect.id)).toBeNull()
      expect(await getTestBanEvasionFlagState(community.id, secondSuspect.id)).toMatchObject({
        suspected_ban_evader_dismissed_at: null,
        suspected_ban_evader_dismissed_by_id: null,
      })
    } finally {
      await unsuspendTestUser(staff.id)
    }
  })
})
