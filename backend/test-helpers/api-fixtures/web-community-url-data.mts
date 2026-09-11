import { topic } from './data.mts'

export const communityHostname = {
  __entity_type: 'hostname',
  id: 'hostname-1',
  hostname: 'example.com',
  topic_id: topic.id,
}

export const communityUrl = {
  __entity_type: 'url',
  id: 'url-1',
  url: 'https://example.com/article',
  pathname: '/article',
  search_params: {},
  canonical_url_id: null,
  hostname: communityHostname,
}
