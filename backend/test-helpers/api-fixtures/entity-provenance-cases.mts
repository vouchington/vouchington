import { community, pageInfo, topic } from './data.mts'
import { swiftRssFeedSource } from './swift-data.mts'
import { communityOwner } from './web-community-member-data.mts'
import type { ApiFixtureCase } from './types.mts'

const verified = {
  via: 'mcp',
  app: { kind: 'verified', client_id: 'voucha_fixture_agent', client_name: 'Fixture Agent' },
}
const bare = { via: 'api', app: null }
const staffMcp = {
  created_via: 'mcp',
  oauth_client: {
    client_id: 'voucha_fixture_agent',
    client_name: 'Fixture Agent',
    metadata_url: null,
    verified: true,
  },
}
const staffWeb = { created_via: 'web', oauth_client: null }

/** The same entity three ways: written by an MCP agent, written by an API client, written in the web app. */
const variants = <T extends { id: string }>(entity: T, staff = false) => [
  {
    ...entity,
    id: `${entity.id}-mcp`,
    provenance: verified,
    ...(staff && { staff_provenance: staffMcp }),
  },
  {
    ...entity,
    id: `${entity.id}-api`,
    provenance: bare,
    ...(staff && { staff_provenance: { created_via: 'api', oauth_client: null } }),
  },
  { ...entity, id: `${entity.id}-web`, ...(staff && { staff_provenance: staffWeb }) },
]

const byId = <T extends { id: string }>(rows: T[]) =>
  Object.fromEntries(rows.map(row => [row.id, row]))

const entityPage = (type: string, rows: Array<{ id: string }>) => ({
  results: rows.map(row => ({ __entity_type: type, id: row.id })),
  page_info: pageInfo,
  [`${type}s`]: byId(rows),
})

const communitySearch = (staff: boolean) => ({
  ...entityPage('community', variants(community, staff)),
  users: { [communityOwner.id]: communityOwner },
  community_metrics: {},
  community_memberships: {},
  pending_application_community_ids: [],
  bookmarks: {},
})

const topicSearch = (staff: boolean) => ({
  ...entityPage('topic', variants(topic, staff)),
  topic_elections: {},
  election_votes: {},
  topics_metrics: {},
})

const listRows = (staff: boolean) =>
  variants(
    {
      __entity_type: 'list',
      id: 'list-1',
      owner_user_id: 'user-abc',
      name: 'Reading Queue',
      description: 'Articles to read later',
      visibility: 'public',
      created_at: '2026-06-28T10:00:00Z',
      updated_at: '2026-06-28T10:00:00Z',
      removed_at: null,
    },
    staff,
  )

const rssFeedSearch = (staff: boolean) => ({
  results: variants(swiftRssFeedSource, staff),
  page_info: pageInfo,
  bookmarks: {},
  topic_elections: {},
  hostname_elections: {},
})

const entityCase = (
  id: string,
  path: string,
  query: Record<string, string>,
  body: unknown,
  staff: boolean,
): ApiFixtureCase => ({
  id: `entity-provenance.${id}${staff ? '.staff' : ''}`,
  method: 'GET',
  path,
  query,
  route: { routeTemplate: path },
  auth: staff ? 'fixture-admin' : 'fixture-user',
  status: 200,
  body,
  consumers: [],
  migratedFrom: [],
})

export const entityProvenanceApiFixtureCases: ApiFixtureCase[] = [false, true].flatMap(staff => [
  entityCase('communities', '/api/v1/communities', { q: 'test' }, communitySearch(staff), staff),
  entityCase('topics', '/api/v1/topics', { q: 'test' }, topicSearch(staff), staff),
  entityCase('lists', '/api/v1/lists', { limit: '25' }, entityPage('list', listRows(staff)), staff),
  entityCase('rss-feeds', '/api/v1/rss-feeds', { limit: '25' }, rssFeedSearch(staff), staff),
])
