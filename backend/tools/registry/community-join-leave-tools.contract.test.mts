import { describe, expect, it } from 'vitest'
import {
  archiveTestCommunity,
  createTestUser,
  getTestCommunityMember,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestCommunityMember,
  insertTestCommunityRestriction,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { listTestMcpCreateAttempts } from '@voucha/test-helpers/mcp-write-tool-rows'

const SCOPES = ['communities:read', 'communities:write'] as const

const communityWithOwner = async (extra: { visibility?: 'public' | 'private' } = {}) => {
  const owner = await createTestPlusMcpCaller()
  const community = await insertTestCommunity({ createdById: owner.id, ...extra })
  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  return { owner, community }
}
const errorOf = async (
  caller: Parameters<typeof callRejectedMcpTool>[0],
  tool: string,
  input: object,
) => JSON.parse(await callRejectedMcpTool(caller, tool, input as never, SCOPES))

describe('join_community — real store', () => {
  const TOOL = 'join_community'

  it('joins a public community by id or by slug and returns only the id', async () => {
    const { community } = await communityWithOwner()
    const byId = await createTestPlusMcpCaller()
    const bySlug = await createTestPlusMcpCaller()

    expect(await callStructuredMcpTool(byId, TOOL, { community_id: community.id }, SCOPES)).toEqual(
      { success: true, community_id: community.id },
    )
    expect(
      await callStructuredMcpTool(bySlug, TOOL, { community_id: community.slug }, SCOPES),
    ).toEqual({ success: true, community_id: community.id })

    expect(await getTestCommunityMember(community.id, byId.id)).toMatchObject({ role: 'member' })
    expect(await getTestCommunityMember(community.id, bySlug.id)).toMatchObject({ role: 'member' })
  })

  it('refuses a second join and keeps the one membership', async () => {
    const { community } = await communityWithOwner()
    const caller = await createTestPlusMcpCaller()
    await callStructuredMcpTool(caller, TOOL, { community_id: community.id }, SCOPES)
    const joined = await getTestCommunityMember(community.id, caller.id)

    expect(await errorOf(caller, TOOL, { community_id: community.id })).toMatchObject({
      error: { status: 409, code: 'CONFLICT' },
    })

    expect(await getTestCommunityMember(community.id, caller.id)).toEqual(joined)
  })

  it('applies the community rules of the web and writes no membership', async () => {
    const caller = await createTestPlusMcpCaller()
    const staff = await createTestUser({ administrator: true })
    const { community: priv } = await communityWithOwner({ visibility: 'private' })
    const { community: archived } = await communityWithOwner()
    await archiveTestCommunity({ communityId: archived.id, archivedById: staff.id })
    const { community: banned } = await communityWithOwner()
    await insertTestCommunityBan({
      communityId: banned.id,
      userId: caller.id,
      bannedById: staff.id,
    })
    const { community: limited } = await communityWithOwner()
    await insertTestCommunityRestriction({
      communityId: limited.id,
      restrictionType: 'approved_members_only',
      activatedById: staff.id,
    })

    for (const [community_id, status] of [
      [priv.id, 403],
      [archived.id, 403],
      [banned.id, 403],
      [limited.id, 403],
      [crypto.randomUUID(), 404],
      ['no-such-community-slug', 404],
    ] as const) {
      expect(await errorOf(caller, TOOL, { community_id })).toMatchObject({ error: { status } })
    }

    for (const community of [priv, archived, banned, limited]) {
      expect(await getTestCommunityMember(community.id, caller.id)).toBeNull()
    }
    expect(await listTestMcpCreateAttempts(caller.id)).toEqual([])
  })

  it.each([
    ['a missing community', {}],
    ['an unexpected field', { community_id: 'a-slug', role: 'owner' }],
    ['a non-string community', { community_id: 7 }],
  ])('refuses %s as invalid arguments', async (_label, input) => {
    const caller = await createTestPlusMcpCaller()
    expect(await callRejectedMcpTool(caller, TOOL, input, SCOPES)).toContain(
      'Invalid tool arguments',
    )
  })

  it('requires the write scope, the Plus plan and an unsuspended owner', async () => {
    const { community } = await communityWithOwner()
    const caller = await createTestPlusMcpCaller()
    const input = { community_id: community.id }

    expect(await callRejectedMcpTool(caller, TOOL, input, ['communities:read'])).toContain(
      'Tool requires scopes',
    )
    expect(
      await callRejectedMcpTool({ ...caller, membership_plan: null }, TOOL, input, SCOPES),
    ).toContain('requires a higher plan')
    await suspendTestUser(caller.id)
    try {
      expect(await callRejectedMcpTool(caller, TOOL, input, SCOPES)).toContain('suspended')
    } finally {
      await unsuspendTestUser(caller.id)
    }

    expect(await getTestCommunityMember(community.id, caller.id)).toBeNull()
  })
})

describe('leave_community — real store', () => {
  const TOOL = 'leave_community'

  it('ends only the caller membership and returns only the id', async () => {
    const { community } = await communityWithOwner()
    const caller = await createTestPlusMcpCaller()
    const other = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: caller.id })
    await insertTestCommunityMember({ communityId: community.id, userId: other.id })

    expect(
      await callStructuredMcpTool(caller, TOOL, { community_id: community.slug }, SCOPES),
    ).toEqual({ success: true, community_id: community.id })

    expect(await getTestCommunityMember(community.id, caller.id)).toBeNull()
    expect(await getTestCommunityMember(community.id, other.id)).not.toBeNull()
  })

  it('refuses a second leave, the owner and a non-member, changing nothing', async () => {
    const { owner, community } = await communityWithOwner()
    const caller = await createTestPlusMcpCaller()
    await insertTestCommunityMember({ communityId: community.id, userId: caller.id })
    await callStructuredMcpTool(caller, TOOL, { community_id: community.id }, SCOPES)

    expect(await errorOf(caller, TOOL, { community_id: community.id })).toMatchObject({
      error: { status: 404, code: 'NOT_FOUND' },
    })
    expect(await errorOf(owner, TOOL, { community_id: community.id })).toMatchObject({
      error: { status: 422, code: 'INVALID_INPUT' },
    })

    expect(await getTestCommunityMember(community.id, owner.id)).toMatchObject({ role: 'owner' })
  })

  it('refuses an archived or unknown community and keeps the membership', async () => {
    const staff = await createTestUser({ administrator: true })
    const { community } = await communityWithOwner()
    const caller = await createTestPlusMcpCaller()
    await insertTestCommunityMember({ communityId: community.id, userId: caller.id })
    await archiveTestCommunity({ communityId: community.id, archivedById: staff.id })

    expect(await errorOf(caller, TOOL, { community_id: community.id })).toMatchObject({
      error: { status: 403, code: 'FORBIDDEN' },
    })
    expect(await errorOf(caller, TOOL, { community_id: crypto.randomUUID() })).toMatchObject({
      error: { status: 404 },
    })

    expect(await getTestCommunityMember(community.id, caller.id)).not.toBeNull()
  })

  it.each([
    ['a missing community', {}],
    ['an unexpected field', { community_id: 'a-slug', force: true }],
  ])('refuses %s as invalid arguments', async (_label, input) => {
    const caller = await createTestPlusMcpCaller()
    expect(await callRejectedMcpTool(caller, TOOL, input, SCOPES)).toContain(
      'Invalid tool arguments',
    )
  })

  it('requires the write scope, the Plus plan and an unsuspended owner', async () => {
    const { community } = await communityWithOwner()
    const caller = await createTestPlusMcpCaller()
    await insertTestCommunityMember({ communityId: community.id, userId: caller.id })
    const input = { community_id: community.id }

    expect(await callRejectedMcpTool(caller, TOOL, input, ['communities:read'])).toContain(
      'Tool requires scopes',
    )
    expect(
      await callRejectedMcpTool({ ...caller, membership_plan: null }, TOOL, input, SCOPES),
    ).toContain('requires a higher plan')
    await suspendTestUser(caller.id)
    try {
      expect(await callRejectedMcpTool(caller, TOOL, input, SCOPES)).toContain('suspended')
    } finally {
      await unsuspendTestUser(caller.id)
    }

    expect(await getTestCommunityMember(community.id, caller.id)).not.toBeNull()
  })
})
