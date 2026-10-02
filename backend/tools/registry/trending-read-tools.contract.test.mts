import { encodeCursor } from '@modules/pagination'
import { createUserReferralLink } from '@services/user-referral-program-links'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createReferralProgramFixture,
  disableReferralProgramByTopicId,
} from '@voucha/test-helpers/entities/referral-programs'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
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
const byId = (entries: Entry[]) => entries.toSorted((a, b) => a.id.localeCompare(b.id))

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

describe('get_trending_communities — real DB', () => {
  const random = createRandomString(8).toLowerCase()
  let caller: Caller
  let high: { id: string }
  let low: { id: string }
  let hidden: { id: string }

  const trending = (args: Record<string, unknown> = {}) =>
    callStructuredMcpTool(caller, 'get_trending_communities', args, [
      'communities:read',
    ]) as Promise<Page>
  const viaTool: PageOf = after => trending({ limit: 25, after })
  const viaRest: PageOf = async after => {
    const request = createRequest()
    await request.authenticateAs(caller)
    const { body } = await request
      .get(`/api/v1/trending-communities?limit=25&after=${after}`)
      .expect(200)
    return { success: true, results: body.communities, page_info: body.page_info }
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
  })

  it('scores a public community by its reviewed posts and members, like REST', async () => {
    const wanted = [high.id, low.id]
    const ours = (entries: Entry[]) => byId(entries.filter(entry => wanted.includes(entry.id)))

    const tool = ours(await seenUntil(wanted, startAt(6), viaTool))
    const rest = ours(await seenUntil(wanted, startAt(6), viaRest))

    expect(tool).toEqual(
      byId([
        {
          id: high.id,
          trending_score: 5,
          member_count: 2,
          post_count: 3,
          virtual_subscription_count: 0,
        },
        {
          id: low.id,
          trending_score: 2,
          member_count: 1,
          post_count: 1,
          virtual_subscription_count: 0,
        },
      ]),
    )
    expect(tool).toEqual(rest)
  })

  it('never lists a private community, whoever asks and whatever it scores', async () => {
    const seen = await seenUntil([high.id, low.id], startAt(6), viaTool)

    expect(seen.map(entry => entry.id)).not.toContain(hidden.id)
    expect(seen.length).toBeGreaterThanOrEqual(2)
  })

  it('pages by cursor and ends each page on the score order', async () => {
    const first = await trending({ limit: 1, after: startAt(6) })
    const second = await trending({ limit: 1, after: first.page_info.end_cursor })

    expect(first.results).toHaveLength(1)
    expect(first.page_info.has_next_page).toBe(true)
    expect(second.results[0]?.id).not.toBe(first.results[0]?.id)
    expect(second.results[0]!.trending_score).toBeLessThanOrEqual(first.results[0]!.trending_score)
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

describe('get_trending_referral_programs — real DB', () => {
  let caller: Caller
  let busy: string
  let quiet: string
  let disabled: string

  const trending = (args: Record<string, unknown> = {}) =>
    callStructuredMcpTool(caller, 'get_trending_referral_programs', args, [
      'topics:read',
    ]) as Promise<Page>
  const viaTool: PageOf = after => trending({ limit: 25, after })
  const viaRest: PageOf = async after => {
    const request = createRequest()
    await request.authenticateAs(caller)
    const { body } = await request
      .get(`/api/v1/trending-referral-programs?limit=25&after=${after}`)
      .expect(200)
    return { success: true, results: body.referral_programs, page_info: body.page_info }
  }

  async function createProgram(links: number) {
    const owner = await createTestUser()
    const { referralProgramId, hostname } = await createReferralProgramFixture({
      createdById: owner.id,
    })
    for (let index = 0; index < links; index += 1) {
      await createUserReferralLink(owner, WEB_PROVENANCE, {
        user_id: owner.id,
        referral_program_id: referralProgramId,
        url: `https://${hostname}/ref/${createRandomString(8)}`,
      })
    }
    return referralProgramId
  }

  beforeAll(async () => {
    caller = asCaller(await createTestUser())
    ;[busy, quiet, disabled] = await Promise.all([
      createProgram(3),
      createProgram(1),
      createProgram(2),
    ])
    await disableReferralProgramByTopicId(disabled)
  })

  it('counts the recent active links of an enabled program, like REST', async () => {
    const wanted = [busy, quiet]
    const ours = (entries: Entry[]) => byId(entries.filter(entry => wanted.includes(entry.id)))

    const tool = ours(await seenUntil(wanted, startAt(3), viaTool))
    const rest = ours(await seenUntil(wanted, startAt(3), viaRest))

    expect(tool).toEqual(
      byId([
        { id: busy, trending_score: 3, link_count: 3 },
        { id: quiet, trending_score: 1, link_count: 1 },
      ]),
    )
    expect(tool).toEqual(rest)
  })

  it('leaves a disabled program out, however many links it has', async () => {
    const seen = await seenUntil([busy, quiet], startAt(3), viaTool)

    expect(seen.map(entry => entry.id)).not.toContain(disabled)
  })

  it('pages by cursor and refuses a malformed one', async () => {
    const first = await trending({ limit: 1, after: startAt(3) })
    const second = await trending({ limit: 1, after: first.page_info.end_cursor })

    expect(first.results).toHaveLength(1)
    expect(first.page_info.has_next_page).toBe(true)
    expect(second.results[0]?.id).not.toBe(first.results[0]?.id)
    for (const after of ['not-a-cursor', encodeCursor({ score: 1, id: 'not-a-uuid' })]) {
      expect(await trending({ after })).toEqual(INVALID_CURSOR)
    }
  })
})
