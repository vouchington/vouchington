import { optionArgs, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { encodeCursor } from '@modules/pagination'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { refreshMaterializedViewForTest } from '../../test-helpers/refresh-materialized-view-for-test.mts'
import { beforeAll, describe, expect, it } from 'vitest'

type Entry = { id: string; trending_score: number } & Record<string, unknown>
type Page = {
  success: true
  results: Entry[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}
type PageOf = (after: string) => Promise<Page>

const INVALID_CURSOR = { success: false, error: 'Invalid cursor' }
const HIGHEST_ID = 'ffffffff-ffff-7fff-bfff-ffffffffffff'
const MAX_PAGES = 40

// A signed-in user that is also a valid MCP caller (no paid plan).
const asCaller = (user: Awaited<ReturnType<typeof createTestUser>>) => ({
  ...user,
  membership_plan: null,
})
type Caller = ReturnType<typeof asCaller>
/** A cursor that starts the listing at the scores up to and including `score`. */
const startAt = (score: number) => encodeCursor({ score: score + 0.5, id: HIGHEST_ID })

/** Pages down from `after` until every wanted id has been seen, and returns every entry seen. */
async function seenUntil(wanted: string[], after: string, pageOf: PageOf): Promise<Entry[]> {
  const seen: Entry[] = []
  let cursor: string | null = after
  for (let pages = 0; cursor && pages < MAX_PAGES; pages += 1) {
    const page = await pageOf(cursor)
    seen.push(...page.results)
    if (wanted.every(id => seen.some(entry => entry.id === id))) break
    cursor = page.page_info.has_next_page ? page.page_info.end_cursor : null
  }
  return seen
}

describe('discover_communities.search sort trending — real DB', () => {
  const random = createRandomString(8).toLowerCase()
  let caller: Caller
  let high: { id: string }
  let low: { id: string }
  let hidden: { id: string }

  const trending = (args: Record<string, unknown> = {}) =>
    callStructuredMcpTool(
      caller,
      'discover_communities',
      optionArgs('search', { sort: 'trending', ...args }),
      ['communities:read'],
    ) as Promise<Page>
  /** Community entries nest the community; the REST rows carry the id directly. */
  const withId = (page: Page): Page => ({
    ...page,
    results: page.results.map(entry => ({
      ...entry,
      id: (entry as { community?: { id: string } }).community?.id ?? entry.id,
    })),
  })
  const viaTool: PageOf = async after => withId(await trending({ limit: 25, after }))
  const viaRest: PageOf = async after => {
    const request = createRequest()
    await request.authenticateAs(caller)
    const { body } = await request
      .get(`/api/v1/communities?sort=trending&limit=25&after=${after}`)
      .expect(200)
    return { success: true, results: body.results, page_info: body.page_info }
  }

  async function createCommunity(visibility: 'public' | 'private', posts: number, members: number) {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `trending-${visibility}-${posts}-${random}`,
      visibility,
    })
    const users = await Promise.all(Array.from({ length: members - 1 }, () => createTestUser()))
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await Promise.all(
      users.map(user => insertTestCommunityMember({ communityId: community.id, userId: user.id })),
    )
    for (let index = 0; index < posts; index += 1) {
      const postId = await insertTestPost({
        title: `Trending ${index} ${random}`,
        slug: `trending-${community.slug}-${index}`,
        createdById: owner.id,
        markdown: `A reviewed post ${index}`,
        communityId: community.id,
        privacy: 'public',
        broadcast: 'everyone',
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: owner.id,
      })
    }
    return community
  }

  beforeAll(async () => {
    caller = asCaller(await createTestUser())
    ;[high, low, hidden] = await Promise.all([
      createCommunity('public', 3, 2),
      createCommunity('public', 1, 1),
      createCommunity('private', 4, 2),
    ])
    await refreshMaterializedViewForTest('mv_trending_communities')
  })

  it('ranks a public community by its reviewed posts and members, like REST', async () => {
    const wanted = [high.id, low.id]
    const ours = (entries: Entry[]) => entries.filter(entry => wanted.includes(entry.id))

    const tool = ours(await seenUntil(wanted, startAt(6), viaTool))
    const rest = ours(await seenUntil(wanted, startAt(6), viaRest))

    expect(tool.map(entry => entry.id)).toEqual([high.id, low.id])
    expect(rest.map(entry => entry.id)).toEqual(tool.map(entry => entry.id))
    expect(tool[0]).not.toHaveProperty('trending_score')
  })

  it('never lists a private community, whoever asks and whatever it scores', async () => {
    const seen = await seenUntil([high.id, low.id], startAt(6), viaTool)

    expect(seen.map(entry => entry.id)).not.toContain(hidden.id)
    expect(seen.length).toBeGreaterThanOrEqual(2)
  })

  it('pages by cursor and ends each page on the score order', async () => {
    const first = withId(await trending({ limit: 1, after: startAt(6) }))
    const second = withId(await trending({ limit: 1, after: first.page_info.end_cursor }))

    expect(first.results).toHaveLength(1)
    expect(first.page_info.has_next_page).toBe(true)
    expect(second.results[0]?.id).not.toBe(first.results[0]?.id)
  })

  it('refuses a malformed cursor and a cursor of another kind', async () => {
    for (const after of [
      'not-a-cursor',
      encodeCursor({ id: HIGHEST_ID }),
      encodeCursor({ score: 1, id: 'not-a-uuid' }),
    ]) {
      expect(await trending({ after })).toEqual(INVALID_CURSOR)
    }
  })
})
