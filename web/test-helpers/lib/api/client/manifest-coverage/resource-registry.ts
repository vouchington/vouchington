import type { ManifestEndpoint } from './endpoint-registry'

/* c8 ignore next -- manifest-coverage.test asserts these static fixture entries through the aggregate registry. */
export const resourceEndpointRegistry: Record<string, ManifestEndpoint> = {
  'native.hostnames.default': {
    method: 'GET',
    path: '/api/v1/hostnames',
    query: { limit: '25', query: 'example' },
  },
  'native.hostname.default': { method: 'GET', path: '/api/v1/hostnames/hostname-1' },
  'native.urls.default': {
    method: 'GET',
    path: '/api/v1/urls',
    query: { limit: '25', query: 'example' },
  },
  'native.url.default': { method: 'GET', path: '/api/v1/urls/url-1' },
  'native.url-crawls.default': {
    method: 'GET',
    path: '/api/v1/urls/url-1/crawls',
    query: { limit: '25' },
  },
  'native.url-crawl.default': { method: 'GET', path: '/api/v1/urls/url-1/crawls/crawl-1' },
  'native.url-crawl-trigger.default': { method: 'POST', path: '/api/v1/urls/url-1/crawl' },
}
