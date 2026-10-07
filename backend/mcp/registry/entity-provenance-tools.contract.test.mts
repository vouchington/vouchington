import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestList,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import {
  callStructuredMcpTool,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'

type Body = Record<string, unknown>
type Kind = 'api' | 'mcp' | 'web'
type Provenance = NonNullable<Parameters<typeof insertTestList>[0]['provenance']>

const KINDS = ['api', 'mcp', 'web'] as const
const READ = ['communities:read', 'topics:read', 'lists:read', 'rss-feeds:read'] as const
const WRITE = ['lists:read', 'lists:write'] as const

/** An API or MCP row says so, a web row says nothing, and no MCP reader gets the staff detail. */
const EXPECTED: Record<Kind, unknown> = {
  api: { provenance: { via: 'api', app: null }, staffProvenance: false },
  mcp: { provenance: { via: 'mcp', app: null }, staffProvenance: false },
  web: { provenance: 'absent', staffProvenance: false },
}

const token = randomBytes(5).toString('hex')

/** What a reader of one MCP entity learns about where it came from. */
const seen = (row: Body | undefined) => ({
  provenance: row && 'provenance' in row ? row.provenance : 'absent',
  staffProvenance: row ? 'staff_provenance' in row : 'row missing',
})

/** The provenance each kind of row shows, picked out of a page by its id. */
const seenInPage = (rows: Body[], ids: Record<Kind, string>, entity = (row: Body) => row) =>
  Object.fromEntries(
    KINDS.map(kind => {
      const row = rows.find(candidate => candidate.id === ids[kind])
      return [kind, seen(row && entity(row))]
    }),
  )

describe('MCP entity tools carry the public provenance label — real DB', () => {
  let admin: McpContractCaller
  let author: McpContractCaller
  let communities: Record<Kind, string>
  let topics: Record<Kind, string>
  let lists: Record<Kind, string>
  let feeds: Record<Kind, string>

  beforeAll(async () => {
    const [user, administrator] = await Promise.all([
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    admin = { ...administrator, membership_plan: null }
    author = { ...user, membership_plan: 'plus' }
    const clientId = await insertContentProvenanceOAuthClient({})
    const provenance: Record<Kind, Provenance> = {
      api: { createdVia: 'api', oauthClientId: null },
      mcp: { createdVia: 'mcp', oauthClientId: clientId },
      web: { createdVia: 'web', oauthClientId: null },
    }
    const seed = async <T,>(make: (kind: Kind, provenance: Provenance) => Promise<T>) =>
      Object.fromEntries(
        await Promise.all(KINDS.map(async kind => [kind, await make(kind, provenance[kind])])),
      ) as Record<Kind, T>
    communities = await seed(async (kind, value) => {
      const community = await insertTestCommunity({
        createdById: user.id,
        name: `Provenance ${token} ${kind}`,
        provenance: value,
      })
      return community.id
    })
    topics = await seed((kind, value) =>
      insertTestTopic({
        name: `Provenance ${token} ${kind}`,
        slug: `provenance-${token}-${kind}`,
        createdById: user.id,
        provenance: value,
      }),
    )
    lists = await seed(async (kind, value) => {
      const list = await insertTestList({
        ownerUserId: admin.id,
        name: `Provenance ${token} ${kind}`,
        visibility: 'public',
        provenance: value,
      })
      return list.id
    })
    feeds = await seed(
      async (kind, value) =>
        (await insertTestRssFeedDirect({ title: `Provenance ${token} ${kind}`, provenance: value }))
          .id,
    )
  })

  const call = (name: string, args: Body) => callStructuredMcpTool(admin, name, args, READ)

  it('get_community labels an API or MCP community and leaves a web one bare', async () => {
    const entries = await Promise.all(
      KINDS.map(kind => call('get_community', { community_id: communities[kind] })),
    )

    expect(entries.map(entry => seen(entry.community as Body))).toEqual(KINDS.map(k => EXPECTED[k]))
  })

  it('search_communities labels each community it returns', async () => {
    const page = await call('search_communities', { q: `Provenance ${token}` })
    const results = (page.results as Array<{ community: Body }>).map(entry => entry.community)

    expect(seenInPage(results, communities)).toEqual(EXPECTED)
  })

  it('get_topic_details labels an API or MCP topic and leaves a web one bare', async () => {
    const details = await Promise.all(
      KINDS.map(kind => call('get_topic_details', { topic_id: topics[kind] })),
    )

    expect(details.map(seen)).toEqual(KINDS.map(k => EXPECTED[k]))
  })

  it('get_list labels an API or MCP list and leaves a web one bare', async () => {
    const found = await Promise.all(KINDS.map(kind => call('get_list', { list_id: lists[kind] })))

    expect(found.map(entry => seen(entry.list as Body))).toEqual(KINDS.map(k => EXPECTED[k]))
  })

  it('get_my_lists labels each of the caller lists', async () => {
    const page = await call('get_my_lists', { limit: 25 })

    expect(seenInPage(page.results as Body[], lists)).toEqual(EXPECTED)
  })

  it('get_rss_feed labels an API or MCP feed and leaves a web one bare', async () => {
    const found = await Promise.all(
      KINDS.map(kind => call('get_rss_feed', { rss_feed_id: feeds[kind] })),
    )

    expect(found.map(entry => seen(entry.rss_feed as Body))).toEqual(KINDS.map(k => EXPECTED[k]))
  })

  it('search_rss_feeds labels each feed it returns', async () => {
    const page = await call('search_rss_feeds', { q: `Provenance ${token}` })

    expect(seenInPage(page.results as Body[], feeds)).toEqual(EXPECTED)
  })

  it('create_list and update_list echo the label of the MCP list they wrote', async () => {
    const created = await callStructuredMcpTool(
      author,
      'create_list',
      { name: `Provenance ${token} echo` },
      WRITE,
    )
    const renamed = await callStructuredMcpTool(
      author,
      'update_list',
      { list_id: (created.list as Body).id, name: `Provenance ${token} renamed` },
      WRITE,
    )

    expect([seen(created.list as Body), seen(renamed.list as Body)]).toEqual([
      EXPECTED.mcp,
      EXPECTED.mcp,
    ])
  })
})
