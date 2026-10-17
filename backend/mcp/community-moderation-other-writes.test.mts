import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityInvite,
} from '@voucha/test-helpers'
import { getCommunityMember, searchInvites } from '@services/communities'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'

const scopes = ['community-moderation:read', 'community-moderation:write'] as const
const readScopes = ['community-moderation:read'] as const

async function fixture() {
  const owner = await createTestPlusMcpCaller()
  const member = await createTestUser()
  const community = await insertTestCommunity({ createdById: owner.id })
  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({ communityId: community.id, userId: member.id })
  return { owner, member, community }
}

describe('community moderation MCP other writes — real PostgreSQL and Valkey', () => {
  it.each(['ban_user', 'activate_restrictions'])('rejects empty %s expiry values', async option => {
    const { owner, member, community } = await fixture()
    const error = await callRejectedMcpTool(
      owner,
      'add_community_moderation',
      optionArgs(option, {
        community: community.id,
        expires_at: '',
        ...(option === 'ban_user' ? { user_id: member.id } : { restriction_types: ['no_links'] }),
      }),
      scopes,
    )
    expect(error).toContain('expires_at')
    const result = await callStructuredMcpTool(
      owner,
      'read_community_moderation',
      optionArgs(option === 'ban_user' ? 'list_bans' : 'list_restrictions', {
        community: community.id,
      }),
      readScopes,
    )
    expect(result.results).toEqual([])
  })

  it('activates and lifts a restriction with a structured list response', async () => {
    const { owner, member, community } = await fixture()
    const args = optionArgs('activate_restrictions', {
      community: community.slug,
      restriction_types: ['no_links'],
      reason: 'Links are temporarily limited',
    })
    expect(
      await callRejectedMcpTool(
        { ...member, membership_plan: 'plus' },
        'add_community_moderation',
        args,
        scopes,
      ),
    ).toContain('Forbidden')
    const added = await callStructuredMcpTool(owner, 'add_community_moderation', args, scopes)
    const restrictions = added.community_restrictions as Record<string, Record<string, unknown>>
    const [restrictionId] = Object.keys(restrictions)
    expect(restrictionId).toBeDefined()
    expect(restrictions[restrictionId!]).toMatchObject({
      community_id: community.id,
      restriction_type: 'no_links',
      activated_by_id: owner.id,
    })
    const read = () =>
      callStructuredMcpTool(
        owner,
        'read_community_moderation',
        optionArgs('list_restrictions', { community: community.id }),
        readScopes,
      )
    expect((await read()).results).toHaveLength(1)
    expect(
      await callStructuredMcpTool(
        owner,
        'remove_community_moderation',
        optionArgs('lift_restriction', { community: community.id, id: restrictionId }),
        scopes,
      ),
    ).toEqual({ success: true })
    const lifted = await read()
    expect(lifted.results).toEqual([expect.objectContaining({ id: restrictionId })])
    expect(
      (lifted.community_restrictions as Record<string, Record<string, unknown>>)[restrictionId!],
    ).toMatchObject({ lifted_at: expect.any(String), lifted_by_id: owner.id })
  })

  it('creates and deletes a saved reply while preserving its guarded read contract', async () => {
    const { owner, member, community } = await fixture()
    const title = `Saved reply ${crypto.randomUUID().slice(0, 8)}`
    const args = optionArgs('create_saved_reply', {
      community: community.slug,
      title,
      body: 'Please review the community rules.',
    })
    expect(
      await callRejectedMcpTool(
        { ...owner, membership_plan: null },
        'add_community_moderation',
        args,
        scopes,
      ),
    ).toContain('requires a higher plan')
    expect(
      await callRejectedMcpTool(
        { ...member, membership_plan: 'plus' },
        'add_community_moderation',
        args,
        scopes,
      ),
    ).toContain('Forbidden')
    const added = await callStructuredMcpTool(owner, 'add_community_moderation', args, scopes)
    const reply = added.reply as { id: string; title: string }
    expect(reply.title).toContain(title)
    const read = () =>
      callStructuredMcpTool(
        owner,
        'read_community_moderation',
        optionArgs('list_saved_replies', { community: community.id }),
        readScopes,
      )
    expect((await read()).results).toEqual([expect.objectContaining({ id: reply.id })])
    expect(
      await callStructuredMcpTool(
        owner,
        'remove_community_moderation',
        optionArgs('delete_saved_reply', { community: community.id, id: reply.id }),
        scopes,
      ),
    ).toEqual({ success: true })
    expect((await read()).results).toEqual([])
  })

  it('sets and clears vacation while retaining the digest preference', async () => {
    const { owner, community } = await fixture()
    const endsAt = new Date(Date.now() + 3_600_000).toISOString()
    const set = await callStructuredMcpTool(
      owner,
      'update_community_moderation',
      optionArgs('set_moderator_vacation', { community: community.slug, ends_at: endsAt }),
      scopes,
    )
    expect(set.vacation).toMatchObject({ community_id: community.id, user_id: owner.id })
    const digest = await callStructuredMcpTool(
      owner,
      'update_community_moderation',
      optionArgs('set_vacation_digest_preference', {
        community: community.id,
        should_suppress_community_digests_while_on_vacation: true,
      }),
      scopes,
    )
    expect(digest).toEqual({ should_suppress_community_digests_while_on_vacation: true })
    expect(
      await callStructuredMcpTool(
        owner,
        'remove_community_moderation',
        optionArgs('clear_moderator_vacation', { community: community.id }),
        scopes,
      ),
    ).toEqual({ success: true })
    const after = await callStructuredMcpTool(
      owner,
      'read_community_moderation',
      optionArgs('read_moderator_vacation', { community: community.id }),
      readScopes,
    )
    expect(after).toMatchObject({
      vacation: null,
      should_suppress_community_digests_while_on_vacation: true,
    })
  })
  it('removes an active member only with moderator authority and rejects self-removal', async () => {
    const { owner, member, community } = await fixture()
    const remove = optionArgs('remove_member', { community: community.id, userId: member.id })
    expect(
      await callRejectedMcpTool(
        { ...member, membership_plan: 'plus' },
        'remove_community_moderation',
        optionArgs('remove_member', { community: community.id, userId: owner.id }),
        scopes,
      ),
    ).toContain('Forbidden')
    expect(await getCommunityMember(community.id, member.id)).not.toBeNull()
    expect(
      await callRejectedMcpTool(
        owner,
        'remove_community_moderation',
        optionArgs('remove_member', { community: community.id, userId: owner.id }),
        scopes,
      ),
    ).toContain('remove yourself')
    expect(
      await callStructuredMcpTool(owner, 'remove_community_moderation', remove, scopes),
    ).toEqual({
      success: true,
    })
    expect(await getCommunityMember(community.id, member.id)).toBeNull()
  })

  it('revokes an invite with the invite community authority and rejects reuse', async () => {
    const { owner, member, community } = await fixture()
    const invite = await insertTestCommunityInvite({
      communityId: community.id,
      invitedById: owner.id,
      invitedUserId: member.id,
    })
    const args = optionArgs('revoke_invite', { community: community.slug, id: invite.id })
    expect(
      await callRejectedMcpTool(
        { ...member, membership_plan: 'plus' },
        'remove_community_moderation',
        args,
        scopes,
      ),
    ).toContain('Forbidden')
    expect((await searchInvites(community.id)).results[0]?.revoked_at).toBeNull()
    expect(await callStructuredMcpTool(owner, 'remove_community_moderation', args, scopes)).toEqual(
      {
        success: true,
      },
    )
    expect((await searchInvites(community.id)).results[0]?.revoked_at).not.toBeNull()
    expect(await callRejectedMcpTool(owner, 'remove_community_moderation', args, scopes)).toContain(
      'already been used or revoked',
    )
  })
})
