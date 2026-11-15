import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityRestriction,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { encodeCursor } from '@modules/pagination'
import { searchCommunityRestrictions } from './search.mts'

async function fixture() {
  const owner = await createTestUser()
  const community = await insertTestCommunity({ createdById: owner.id })
  const other = await insertTestCommunity({ createdById: owner.id })
  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({ communityId: other.id, userId: owner.id, role: 'owner' })
  const first = await insertTestCommunityRestriction({
    communityId: community.id,
    activatedById: owner.id,
    restrictionType: 'no_links',
  })
  const second = await insertTestCommunityRestriction({
    communityId: community.id,
    activatedById: owner.id,
    restrictionType: 'require_post_approval',
  })
  await insertTestCommunityRestriction({
    communityId: community.id,
    activatedById: owner.id,
    restrictionType: 'no_links',
    expiresAt: new Date(Date.now() - 60_000),
  })
  await insertTestCommunityRestriction({
    communityId: other.id,
    activatedById: owner.id,
    restrictionType: 'no_links',
  })
  return { owner, community, other, first, second }
}

describe('restriction cursor resource scope', () => {
  it('rejects another status or community instead of skipping newer history', async () => {
    const { community, other, first, second } = await fixture()
    const page = await searchCommunityRestrictions(community.id, { limit: 1 })
    expect(page.results.map(row => row.id)).toEqual([second.id])
    const after = page.page_info.end_cursor!
    await expect(
      searchCommunityRestrictions(community.id, { status: 'past', after }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(searchCommunityRestrictions(other.id, { after })).rejects.toMatchObject({
      status: 400,
    })
    const next = await searchCommunityRestrictions(community.id.toUpperCase(), {
      status: 'active',
      limit: 2,
      after,
    })
    expect(next.results.map(row => row.id)).toEqual([first.id])
    expect(next.page_info.has_next_page).toBe(false)
    await expect(
      searchCommunityRestrictions(community.id, { after: encodeCursor({ id: second.id }) }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('shares opaque cursors between REST aliases and MCP while rejecting changed filters', async () => {
    const { owner, community, other, first, second } = await fixture()
    const request = createRequest()
    await request.authenticateAs(owner)
    const page = await request
      .get(`/api/v1/communities/${community.slug}/restrictions?limit=1`)
      .expect(200)
    expect(page.body.results.map((row: { id: string }) => row.id)).toEqual([second.id])
    const after = page.body.page_info.end_cursor as string
    const scopes = ['community-moderation:read'] as const
    const mcpNext = await callStructuredMcpTool(
      { ...owner, membership_plan: null },
      'read_community_moderation',
      optionArgs('list_restrictions', {
        community: community.id,
        status: 'active',
        limit: 2,
        after,
      }),
      scopes,
    )
    expect(mcpNext.results).toEqual([expect.objectContaining({ id: first.id })])
    const mcpPage = await callStructuredMcpTool(
      { ...owner, membership_plan: null },
      'read_community_moderation',
      optionArgs('list_restrictions', { community: community.slug, limit: 1 }),
      scopes,
    )
    const mcpAfter = (mcpPage.page_info as { end_cursor: string }).end_cursor
    const restNext = await request
      .get(
        `/api/v1/communities/${community.id}/restrictions?status=active&after=${encodeURIComponent(mcpAfter)}`,
      )
      .expect(200)
    expect(restNext.body.results.map((row: { id: string }) => row.id)).toEqual([first.id])
    await request
      .get(
        `/api/v1/communities/${community.slug}/restrictions?status=past&after=${encodeURIComponent(after)}`,
      )
      .expect(400)
    await request
      .get(`/api/v1/communities/${other.slug}/restrictions?after=${encodeURIComponent(after)}`)
      .expect(400)
    expect(
      await callRejectedMcpTool(
        { ...owner, membership_plan: null },
        'read_community_moderation',
        optionArgs('list_restrictions', { community: community.id, status: 'past', after }),
        scopes,
      ),
    ).toContain('Invalid cursor format')
  })
})
