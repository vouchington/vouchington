import type { PrivateUser } from '@services/users/types'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { beforeAll, describe, expect, it } from 'vitest'

type Caller = PrivateUser & { membership_plan: null }
type Member = { user_id: string; username: string | null; role: string; created_at: string }
type MembersPage = {
  success: true
  results: Member[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

const NOT_FOUND = { success: false, error: 'Community not found' }
const INVALID_CURSOR = { success: false, error: 'Invalid cursor' }

const asCaller = (user: PrivateUser): Caller => ({ ...user, membership_plan: null })

describe('get_community_members — real DB', () => {
  let owner: Caller
  let moderator: Caller
  let members: Caller[]
  let admin: Caller

  beforeAll(async () => {
    const users = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    ;[owner, moderator, ...members] = users.slice(0, 4).map(asCaller) as Caller[]
    admin = asCaller(users[4]!)
  })

  // Memberships are created a second apart so the roster order is stable: owner, moderator, then
  // the members in turn.
  async function roster(options: Partial<Parameters<typeof insertTestCommunity>[0]>) {
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `roster-${createRandomString(8)}`,
      ...options,
    })
    const start = Date.now() - 10_000
    const rows = [
      [owner, 'owner'],
      [moderator, 'moderator'],
      [members[0]!, 'member'],
      [members[1]!, 'member'],
    ] as const
    for (const [index, [user, role]] of rows.entries()) {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role,
        createdAt: new Date(start + index * 1000),
      })
    }
    return community
  }

  const list = (caller: Caller, community_id: string, args: Record<string, unknown> = {}) =>
    callStructuredMcpTool(caller, 'get_community_members', { community_id, ...args }, [
      'communities:read',
    ]) as unknown as Promise<MembersPage>

  it('lists a public roster in order with usernames, roles and ISO dates', async () => {
    const community = await roster({})

    const { results, page_info } = await list(members[0]!, community.slug)

    expect(results.map(member => member.user_id)).toEqual([
      owner.id,
      moderator.id,
      members[0]!.id,
      members[1]!.id,
    ])
    expect(results.map(member => member.role)).toEqual(['owner', 'moderator', 'member', 'member'])
    expect(results[0]).toMatchObject({ username: owner.username })
    expect(new Date(results[0]!.created_at).toISOString()).toBe(results[0]!.created_at)
    expect(page_info.has_next_page).toBe(false)
  })

  it('returns the same roster by id and by slug and as the signed-out REST route', async () => {
    const community = await roster({})
    const response = await createRequest()
      .get(`/api/v1/communities/${community.slug}/members`)
      .expect(200)

    const bySlug = await list(owner, community.slug)
    const byId = await list(admin, community.id)

    expect(byId).toEqual(bySlug)
    const restUserIds = response.body.results.map(
      (row: { id: string }) => response.body.community_members[row.id].user_id,
    )
    expect(bySlug.results.map(member => member.user_id)).toEqual(restUserIds)
  })

  it.each(['members', 'users'] as const)(
    'shows only the owner and moderators of a %s-only roster, even to its own members',
    async visibility => {
      const community = await roster({ member_roster_visibility: visibility })

      for (const caller of [members[0]!, owner, moderator, admin]) {
        const { results } = await list(caller, community.slug)
        expect(results.map(member => member.user_id)).toEqual([owner.id, moderator.id])
      }
    },
  )

  it('filters by role', async () => {
    const community = await roster({})

    const moderators = await list(admin, community.slug, { role: 'moderator' })
    const regular = await list(admin, community.slug, { role: 'member' })

    expect(moderators.results.map(member => member.user_id)).toEqual([moderator.id])
    expect(regular.results.map(member => member.role)).toEqual(['member', 'member'])
  })

  it('pages by cursor and refuses a malformed one', async () => {
    const community = await roster({})

    const first = await list(owner, community.slug, { limit: 3 })
    const second = await list(owner, community.slug, {
      limit: 3,
      after: first.page_info.end_cursor,
    })

    expect(first.results).toHaveLength(3)
    expect(first.page_info.has_next_page).toBe(true)
    expect(second.results.map(member => member.user_id)).toEqual([members[1]!.id])
    expect(second.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(await list(owner, community.slug, { after: 'not-a-cursor' })).toEqual(INVALID_CURSOR)
  })

  it('treats a private community as not found for its owner, member and an administrator', async () => {
    const community = await roster({ visibility: 'private' })

    for (const caller of [owner, moderator, members[0]!, admin]) {
      for (const community_id of [community.id, community.slug]) {
        expect(await list(caller, community_id)).toEqual(NOT_FOUND)
      }
    }
  })
})
