import { getUrlHostnameByAny } from '@services/urls-hostnames'
import {
  createRandomString,
  createTestTopic,
  createTestUser,
  insertTestUrlHostname,
  setUrlHostnameVotes,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callStructuredMcpTool,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import { beforeAll, describe, expect, it } from 'vitest'

type Body = Record<string, unknown>
type Row = { id: string; hostname: string; topic_id: string | null; election: Body | null }
type Page = {
  success: true
  results: Row[]
  page_info: { has_next_page: boolean; end_cursor: string }
}

const INVALID_CURSOR = { success: false, error: 'Invalid cursor' }
const SCOPES = ['hostnames:read'] as const

const asCaller = (user: Awaited<ReturnType<typeof createTestUser>>): McpContractCaller => ({
  ...user,
  membership_plan: null,
})
const names = (page: { results: Row[] }) => page.results.map(row => row.hostname)

describe('search_hostnames and get_top_hostnames — real DB', () => {
  const random = createRandomString(8).toLowerCase()
  const host = (label: string) => `${label}-${random}.example.com`
  let member: McpContractCaller
  let admin: McpContractCaller
  let ids: Record<string, string>
  let topic: Awaited<ReturnType<typeof createTestTopic>>
  let blockedTopic: typeof topic

  // A search names its own hostname part, or else every hostname this run created.
  const search = (args: Body = {}, caller = member) => {
    const named = 'hostname' in args || 'query' in args
    const withDefault = named ? args : { query: random, ...args }
    return callStructuredMcpTool(caller, 'search_hostnames', withDefault, SCOPES) as Promise<Page>
  }
  const top = (args: Body = {}, caller = member) =>
    callStructuredMcpTool(caller, 'get_top_hostnames', args, SCOPES) as Promise<Page>

  beforeAll(async () => {
    ;[member, admin] = (
      await Promise.all([createTestUser(), createTestUser({ administrator: true })])
    ).map(asCaller) as McpContractCaller[]
    ids = Object.fromEntries(
      await Promise.all(
        ['alpha', 'bravo', 'charlie', 'blocked'].map(async label => [
          label,
          await insertTestUrlHostname({ hostname: host(label) }),
        ]),
      ),
    )
    // Net trust: bravo 7, alpha 4, the topic hostname 3, charlie 2. The blocked one has the most.
    await setUrlHostnameVotes(ids['alpha']!, 5, 1)
    await setUrlHostnameVotes(ids['bravo']!, 9, 2)
    await setUrlHostnameVotes(ids['charlie']!, 2, 0)
    await setUrlHostnameVotes(ids['blocked']!, 20, 0)
    await updateUrlHostnameBlocked(ids['blocked']!, true)
    topic = await createTestTopic({ hostname: host('topic') })
    blockedTopic = await createTestTopic({ hostname: host('blockedtopic') })
    ids['topic'] = (await getUrlHostnameByAny(host('topic')))!.id
    ids['blockedtopic'] = (await getUrlHostnameByAny(host('blockedtopic')))!.id
    await setUrlHostnameVotes(ids['topic']!, 3, 0)
    await setUrlHostnameVotes(ids['blockedtopic']!, 50, 0)
    await updateUrlHostnameBlocked(ids['blockedtopic']!, true)
  })

  describe('search_hostnames', () => {
    it('lists hostnames A to Z and never a blocked one, for every caller', async () => {
      for (const caller of [member, admin]) {
        expect(names(await search({}, caller))).toEqual(
          ['alpha', 'bravo', 'charlie', 'topic'].map(host),
        )
      }
    })

    it('returns only the public hostname fields and the public vote totals', async () => {
      const { results } = await search({ hostname: host('alpha') })

      expect(results).toEqual([
        {
          id: ids['alpha'],
          hostname: host('alpha'),
          topic_id: null,
          election: { votes_count_up: 5, votes_count_down: 1, votes_score_net: 4 },
        },
      ])
    })

    it('gives a blocked hostname no result, whichever argument names it', async () => {
      for (const args of [{ hostname: host('blocked') }, { query: host('blocked') }]) {
        expect((await search(args, admin)).results).toEqual([])
      }
    })

    it('returns the same hostnames in the same order as signed-out REST', async () => {
      const rest = await createRequest().get(`/api/v1/hostnames?query=${random}`).expect(200)

      const { results } = await search()

      expect(results.map(row => row.id)).toEqual(
        rest.body.results.map((row: { id: string }) => row.id),
      )
    })

    it('sorts by net trust votes, most first', async () => {
      const { results } = await search({ sort: 'trust' })

      expect(names({ results })).toEqual(['bravo', 'alpha', 'topic', 'charlie'].map(host))
    })

    it('keeps only the hostnames of a topic, by id or slug, and none for an unknown topic', async () => {
      for (const reference of [topic.id, topic.slug]) {
        expect(names(await search({ topic: reference }))).toEqual([host('topic')])
      }
      expect((await search({ topic: `nope-${random}` })).results).toEqual([])
    })

    it('pages by cursor like REST and ends the pages cleanly', async () => {
      const rest = await createRequest().get(`/api/v1/hostnames?query=${random}&limit=3`)
      const first = await search({ limit: 3 })
      const second = await search({ limit: 3, after: first.page_info.end_cursor })
      const restSecond = await createRequest()
        .get(`/api/v1/hostnames?query=${random}&limit=3&after=${rest.body.page_info.end_cursor}`)
        .expect(200)

      expect(first.results).toHaveLength(3)
      expect(first.page_info.has_next_page).toBe(true)
      expect(first.page_info.end_cursor).toBe(rest.body.page_info.end_cursor)
      expect(second.results.map(row => row.id)).toEqual(
        restSecond.body.results.map((row: { id: string }) => row.id),
      )
      expect(second.page_info.has_next_page).toBe(false)
    })

    it('refuses a malformed cursor and a cursor from another sort', async () => {
      const byTrust = await search({ sort: 'trust', limit: 1 })
      const byName = await search({ limit: 1 })

      expect(await search({ after: 'not-a-cursor' })).toEqual(INVALID_CURSOR)
      expect(await search({ after: byTrust.page_info.end_cursor })).toEqual(INVALID_CURSOR)
      expect(await search({ sort: 'trust', after: byName.page_info.end_cursor })).toEqual(
        INVALID_CURSOR,
      )
    })
  })

  describe('get_top_hostnames', () => {
    it('lists the voted hostnames of a topic and never a blocked one', async () => {
      const { results } = await top({ topic: topic.id })

      expect(results).toEqual([
        {
          id: ids['topic'],
          hostname: host('topic'),
          topic_id: topic.id,
          election: { votes_count_up: 3, votes_count_down: 0, votes_score_net: 3 },
        },
      ])
      expect((await top({ topic: blockedTopic.slug }, admin)).results).toEqual([])
    })

    it('returns the same hostnames as signed-out REST and none for an unknown topic', async () => {
      const rest = await createRequest().get(`/api/v1/hostnames/top?topic=${topic.id}`).expect(200)

      expect((await top({ topic: topic.id })).results.map(row => row.id)).toEqual(
        rest.body.results.map((row: { id: string }) => row.id),
      )
      expect((await top({ topic: `nope-${random}` })).results).toEqual([])
    })

    it('leaves a blocked hostname out of the global top, for every caller', async () => {
      for (const caller of [member, admin]) {
        const { results } = await top({ limit: 25 }, caller)

        expect(results.map(row => row.id)).not.toContain(ids['blocked'])
        expect(results.map(row => row.id)).not.toContain(ids['blockedtopic'])
      }
    })

    it('pages by cursor and refuses a malformed one', async () => {
      const first = await top({ limit: 1 })
      const second = await top({ limit: 1, after: first.page_info.end_cursor })

      expect(first.results).toHaveLength(1)
      expect(first.page_info.has_next_page).toBe(true)
      expect(second.results[0]?.id).not.toBe(first.results[0]?.id)
      expect(await top({ after: 'not-a-cursor' })).toEqual(INVALID_CURSOR)
    })
  })
})
