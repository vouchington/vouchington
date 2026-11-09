import type { ManifestEndpoint } from './endpoint-registry'

export const contentContractEndpointRegistry = {
  'native.posts.hacker-news.filtered': {
    method: 'GET',
    path: '/api/v1/posts',
    query: {
      has_hacker_news_references: 'true',
      limit: '25',
      post_types: 'review',
      time_range: '1y',
    },
  },
  'native.posts.hacker-news.detail': { method: 'GET', path: '/api/v1/posts/comment-root' },
  'native.rss-feed-items.hacker-news.list': {
    method: 'GET',
    path: '/api/v1/rss-feed-items',
    query: { limit: '20' },
  },
  'native.podcast-episodes.hacker-news.list': {
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/any',
    query: { limit: '20', media_type: 'audio' },
  },
  'native.posts.time-range.explicit-week': {
    method: 'GET',
    path: '/api/v1/posts',
    query: { limit: '25', sort: 'new', time_range: '1w' },
  },
  'native.posts.time-range.all': {
    method: 'GET',
    path: '/api/v1/posts',
    query: { limit: '25', sort: 'new', time_range: 'all' },
  },
  'native.comments.descendants.short-continuation': {
    method: 'GET',
    path: '/api/v1/posts/70000000-0000-7000-8000-000000005430/descendants',
    query: { limit: '3' },
  },
  'native.comments.descendants.empty-continuation': {
    method: 'GET',
    path: '/api/v1/posts/70000000-0000-7000-8000-000000005430/descendants',
    query: {
      after:
        'eyJpZCI6IjcwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwNTQzMyIsInNjb3BlIjoiY29tbWVudC1kZXNjZW5kYW50cy12Mjo3MDAwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDU0MzA6NzAwMDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDA1NDMwIn0',
      limit: '1',
    },
  },
  'native.comments.descendants.after-filtered-head': {
    method: 'GET',
    path: '/api/v1/posts/70000000-0000-7000-8000-000000005430/descendants',
    query: {
      after:
        'eyJpZCI6IjcwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwNTQzNSIsInNjb3BlIjoiY29tbWVudC1kZXNjZW5kYW50cy12Mjo3MDAwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDU0MzA6NzAwMDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDA1NDMwIn0',
      limit: '3',
    },
  },
  'native.comments.descendants.expand-preview-child': {
    method: 'GET',
    path: '/api/v1/posts/70000000-0000-7000-8000-000000005434/descendants',
    query: { limit: '3' },
  },
} satisfies Record<string, ManifestEndpoint>
