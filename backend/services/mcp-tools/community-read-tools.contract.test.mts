import { updateCommunity } from '@services/communities'
import type { PrivateUser } from '@services/users/types'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callStructuredMcpTool,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import { beforeAll, describe, expect, it } from 'vitest'

type Body = Record<string, unknown>
type Entry = { community: Record<string, unknown>; owner: Body | null; metrics: Body | null }
type Page = { has_next_page: boolean; end_cursor: string | null }

const NOT_FOUND = { success: false, error: 'Community not found' }
const INVALID_CURSOR = { success: false, error: 'Invalid cursor' }

const asCaller = (user: PrivateUser): McpContractCaller => ({ ...user, membership_plan: null })
const call = (caller: McpContractCaller, name: string, args: Body) =>
  callStructuredMcpTool(caller, name, args, ['communities:read'])
const ids = (entries: Entry[]) => entries.map(entry => entry.community['id'])

describe('search_communities and get_community — real DB', () => {
  const random = createRandomString(8)
  let owner: McpContractCaller
  let moderator: McpContractCaller
  let member: McpContractCaller
  let outsider: McpContractCaller
  let admin: McpContractCaller
  let alpha: Awaited<ReturnType<typeof insertTestCommunity>>
  let bravo: typeof alpha
  let charlie: typeof alpha
  let hidden: typeof alpha

  beforeAll(async () => {
    const users = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    ;[owner, moderator, member, outsider, admin] = users.map(asCaller) as McpContractCaller[]
    const make = (name: string, extra: Partial<Parameters<typeof insertTestCommunity>[0]> = {}) =>
      insertTestCommunity({
        createdById: owner.id,
        name: `${name} ${random}`,
        slug: `${name.toLowerCase()}-${random}`,
        ...extra,
      })
    ;[alpha, bravo, charlie, hidden] = await Promise.all([
      make('Alpha', { rules_markdown: 'Be kind to each other' }),
      make('Bravo'),
      make('Charlie'),
      make('Hidden', { visibility: 'private' }),
    ])
    await updateCommunity(users[4]!, alpha.id, { markdown: 'A community about alphabets' })
    const roles = [
      [owner, 'owner'],
      [moderator, 'moderator'],
      [member, 'member'],
    ] as const
    // Alpha has one member, Bravo two and Charlie three, so the members sort reverses the name sort.
    const memberships = [
      [alpha, 1],
      [bravo, 2],
      [charlie, 3],
      [hidden, 3],
    ] as const
    for (const [community, count] of memberships) {
      for (const [user, role] of roles.slice(0, count)) {
        await insertTestCommunityMember({ communityId: community.id, userId: user.id, role })
      }
    }
  })

  describe('get_community', () => {
    it('returns a public community by id and by slug with its owner and public counts', async () => {
      const byId = await call(outsider, 'get_community', { community_id: alpha.id })
      const bySlug = await call(admin, 'get_community', { community_id: alpha.slug })

      expect(bySlug).toEqual(byId)
      expect(byId).toMatchObject({
        success: true,
        community: { id: alpha.id, slug: alpha.slug, name: alpha.name, archived_at: null },
        owner: { id: owner.id, username: owner.username },
        metrics: { member_count: 1, post_count: 0, list_item_count: 0 },
      })
      expect(Object.keys((byId as unknown as Entry).community)).not.toContain('visibility')
      expect(Object.keys((byId as unknown as Entry).community)).not.toContain('created_by_id')
    })

    it('wraps the description and rules as external content', async () => {
      const { community } = (await call(outsider, 'get_community', {
        community_id: alpha.id,
      })) as unknown as Entry

      expect(community['markdown']).toContain('A community about alphabets')
      expect(community['markdown']).not.toBe('A community about alphabets')
      expect(community['rules_markdown']).toContain('Be kind to each other')
      expect(community['rules_markdown']).not.toBe('Be kind to each other')
      expect(
        (await call(outsider, 'get_community', { community_id: bravo.id })) as Body,
      ).toMatchObject({
        community: { markdown: null, rules_markdown: null },
      })
    })

    it.each(['owner', 'moderator', 'member', 'outsider', 'admin'] as const)(
      'treats a private community as not found for its %s',
      async who => {
        const callers = { owner, moderator, member, outsider, admin }

        for (const community_id of [hidden.id, hidden.slug]) {
          expect(await call(callers[who], 'get_community', { community_id })).toEqual(NOT_FOUND)
        }
      },
    )

    it('treats an unknown community as not found', async () => {
      const body = await call(owner, 'get_community', { community_id: `nope-${random}` })

      expect(body).toEqual(NOT_FOUND)
    })
  })

  describe('search_communities', () => {
    const search = (caller: McpContractCaller, args: Body = {}) =>
      call(caller, 'search_communities', { q: random, ...args }) as Promise<{
        success: true
        results: Entry[]
        page_info: Page
      }>

    it('lists public communities by name and never a private one, for every caller', async () => {
      for (const caller of [outsider, member, owner, admin]) {
        const { results } = await search(caller)
        expect(ids(results)).toEqual([alpha.id, bravo.id, charlie.id])
      }
    })

    it('returns the same communities as the signed-out REST route', async () => {
      const response = await createRequest().get(`/api/v1/communities?q=${random}`).expect(200)

      const { results } = await search(member)

      expect(ids(results)).toEqual(response.body.results.map((row: { id: string }) => row.id))
      expect(results[2]?.metrics).toMatchObject({
        member_count: response.body.community_metrics[charlie.id].member_count,
      })
      expect(results[0]?.owner).toEqual({ id: owner.id, username: owner.username })
    })

    it('sorts by members, most first', async () => {
      const { results } = await search(outsider, { sort: 'members' })

      expect(ids(results)).toEqual([charlie.id, bravo.id, alpha.id])
    })

    it('pages by cursor and ends the pages cleanly', async () => {
      const first = await search(outsider, { limit: 1 })
      const second = await search(outsider, { limit: 1, after: first.page_info.end_cursor })
      const last = await search(outsider, { limit: 1, after: second.page_info.end_cursor })

      expect([ids(first.results), ids(second.results), ids(last.results)]).toEqual([
        [alpha.id],
        [bravo.id],
        [charlie.id],
      ])
      expect([first, second, last].map(page => page.page_info.has_next_page)).toEqual([
        true,
        true,
        false,
      ])
      expect(last.page_info.end_cursor).toBeNull()
    })

    it('refuses a malformed cursor and a cursor from another sort', async () => {
      const byMembers = await search(outsider, { sort: 'members', limit: 1 })
      const byName = await search(outsider, { limit: 1 })

      expect(await search(outsider, { after: 'not-a-cursor' })).toEqual(INVALID_CURSOR)
      expect(await search(outsider, { after: byMembers.page_info.end_cursor })).toEqual(
        INVALID_CURSOR,
      )
      expect(
        await search(outsider, { sort: 'members', after: byName.page_info.end_cursor }),
      ).toEqual(INVALID_CURSOR)
    })

    it('returns nothing for a hashtag that matches no topic', async () => {
      const { results } = await search(outsider, { q: `#nosuchtopic${random}` })

      expect(results).toEqual([])
    })
  })
})
