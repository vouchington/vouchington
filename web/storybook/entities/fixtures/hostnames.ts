import type { UrlListResponseBody, Hostname, HostnameListResponse } from './types'
import { page_info } from './shared'
import { topics } from './topics'

export const hostnames = [
  'credit.example',
  'blocked.example',
  'feeds.example',
  'community.example',
].map((hostname, index) => ({
  __entity_type: 'hostname',
  id: `hostname-${hostname.replaceAll('.', '-')}`,
  hostname,
  topic_id: index % 2 === 0 ? topics[0]!.id : null,
  blocked: index === 1,
  crawlable: index !== 2,
  link_rel_follow: index === 0,
})) as unknown as Hostname[]
export const hostnamesResponse: HostnameListResponse = {
  results: hostnames.map(hostname => ({ __entity_type: 'hostname', id: hostname.id })),
  page_info,
  hostnames: Object.fromEntries(hostnames.map(hostname => [hostname.id, hostname])),
  topics: Object.fromEntries(topics.map(topic => [topic.id, topic])),
  hostname_elections: Object.fromEntries(
    hostnames.map((hostname, index) => [
      hostname.id,
      {
        __entity_type: 'hostname_election',
        id: `hostname-election-${hostname.id}`,
        votes_score_net: index === 1 ? -5 : 32 - index,
        votes_count_up: 40 - index,
        votes_count_down: index === 1 ? 12 : 4,
      },
    ]),
  ),
  top_urls_by_hostname_id: Object.fromEntries(
    hostnames.map(hostname => [
      hostname.id,
      [
        {
          id: `url-${hostname.id}`,
          url: `https://${hostname.hostname}/review`,
          pathname: '/review',
        },
      ],
    ]),
  ),
} as unknown as HostnameListResponse
export const urlsResponse: UrlListResponseBody = {
  results: hostnames.map(hostname => ({
    __entity_type: 'url',
    id: `url-${hostname.id}`,
    url: `https://${hostname.hostname}/best-cards?utm_source=storybook`,
    pathname: '/best-cards',
    hostname: { id: hostname.id, hostname: hostname.hostname },
  })),
  page_info,
}
