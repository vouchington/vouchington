import { endpoint, type ManifestEndpoint } from './endpoint-registry'

const communities = endpoint('/api/v1/communities', { q: 'test' })
const topics = endpoint('/api/v1/topics', { q: 'test' })
const lists = endpoint('/api/v1/lists', { limit: '25' })
const rssFeeds = endpoint('/api/v1/rss-feeds', { limit: '25' })

// Entity provenance fixtures document the public label and the staff block for the clients; the
// web app reads them through its own entity wrappers.
export const entityProvenanceEndpointRegistry = {
  'entity-provenance.communities': communities,
  'entity-provenance.communities.staff': communities,
  'entity-provenance.topics': topics,
  'entity-provenance.topics.staff': topics,
  'entity-provenance.lists': lists,
  'entity-provenance.lists.staff': lists,
  'entity-provenance.rss-feeds': rssFeeds,
  'entity-provenance.rss-feeds.staff': rssFeeds,
} satisfies Record<string, ManifestEndpoint>
