import { describe, expect, it } from 'vitest'
import { insertTestCommunity, insertTestCommunityMember } from '@voucha/test-helpers'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'

const scopes = ['community-moderation:read', 'community-moderation:write'] as const

describe('community moderation MCP settings write provenance — real PostgreSQL and Valkey', () => {
  it.each([
    ['update_community_settings', { name: `Updated ${crypto.randomUUID()}` }],
    ['update_post_type_settings', { should_allow_review_posts: true }],
  ] as const)(
    'returns public provenance without staff OAuth client details for %s',
    async (option, body) => {
      const administrator = await createTestPlusMcpCaller({ administrator: true })
      const metadataUrl = `https://client-${crypto.randomUUID()}.example/oauth/client.json`
      const clientRowId = await insertContentProvenanceOAuthClient({ metadataUrl })
      const community = await insertTestCommunity({
        createdById: administrator.id,
        provenance: { createdVia: 'mcp', oauthClientId: clientRowId },
      })

      const result = await callStructuredMcpTool(
        administrator,
        'update_community_moderation',
        optionArgs(option, { community: community.id, ...body }),
        scopes,
      )
      const returned = result.community as Record<string, unknown>
      expect(returned.id).toBe(community.id)
      expect(returned.provenance).toEqual({
        via: 'mcp',
        app: { kind: 'hostname', hostname: new URL(metadataUrl).hostname },
      })
      expect(returned).not.toHaveProperty('staff_provenance')
      expect(JSON.stringify(returned)).not.toContain(clientRowId)
      expect(JSON.stringify(returned)).not.toContain(metadataUrl)
    },
  )

  it('applies archive plus settings atomically, rejects a moderator and archived edits, then unarchives', async () => {
    const owner = await createTestPlusMcpCaller()
    const moderator = await createTestPlusMcpCaller()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    const combined = optionArgs('update_community_settings', {
      community: community.id,
      archive: true,
      name: `Archived ${crypto.randomUUID()}`,
    })
    expect(
      await callRejectedMcpTool(
        moderator,
        'update_community_moderation',
        optionArgs('update_community_settings', { community: community.id, archive: true }),
        scopes,
      ),
    ).toContain('Forbidden')
    const archived = await callStructuredMcpTool(
      owner,
      'update_community_moderation',
      combined,
      scopes,
    )
    expect(archived.community).toMatchObject({
      id: community.id,
      archived_at: expect.any(String),
      name: expect.stringContaining('Archived'),
    })
    expect(
      await callRejectedMcpTool(owner, 'update_community_moderation', combined, scopes),
    ).toContain('Community is already archived')
    expect(
      await callRejectedMcpTool(
        owner,
        'update_community_moderation',
        optionArgs('update_community_settings', { community: community.id, name: 'Too late' }),
        scopes,
      ),
    ).toContain('Archived communities cannot be updated')
    const restored = await callStructuredMcpTool(
      owner,
      'update_community_moderation',
      optionArgs('update_community_settings', { community: community.id, archive: false }),
      scopes,
    )
    expect((restored.community as Record<string, unknown>).archived_at).toBeNull()
  })

  it('preserves enabled invite and approval timestamps, clears them, then enables them again', async () => {
    const owner = await createTestPlusMcpCaller()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const input = {
      community: community.id,
      member_invites_allowed_at: true,
      post_approval_required_at: true,
    }
    const first = await callStructuredMcpTool(
      owner,
      'update_community_moderation',
      optionArgs('update_community_settings', input),
      scopes,
    )
    const firstCommunity = first.community as Record<string, unknown>
    expect(firstCommunity.member_invites_allowed_at).toEqual(expect.any(String))
    expect(firstCommunity.post_approval_required_at).toEqual(expect.any(String))
    const repeated = await callStructuredMcpTool(
      owner,
      'update_community_moderation',
      optionArgs('update_community_settings', input),
      scopes,
    )
    expect(repeated.community).toMatchObject({
      member_invites_allowed_at: firstCommunity.member_invites_allowed_at,
      post_approval_required_at: firstCommunity.post_approval_required_at,
    })
    const disabled = await callStructuredMcpTool(
      owner,
      'update_community_moderation',
      optionArgs('update_community_settings', {
        community: community.id,
        member_invites_allowed_at: false,
        post_approval_required_at: false,
      }),
      scopes,
    )
    expect(disabled.community).toMatchObject({
      member_invites_allowed_at: null,
      post_approval_required_at: null,
    })
    const enabledAgain = await callStructuredMcpTool(
      owner,
      'update_community_moderation',
      optionArgs('update_community_settings', input),
      scopes,
    )
    expect(enabledAgain.community).toMatchObject({
      member_invites_allowed_at: expect.any(String),
      post_approval_required_at: expect.any(String),
    })
  })
})
