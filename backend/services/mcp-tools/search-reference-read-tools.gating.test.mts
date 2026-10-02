import { describe } from 'vitest'
import { registerMcpReadToolGatingTests } from '@voucha/test-helpers/mcp-read-tool-gating'

// Every tool of the trending, referral, search and reference-data families, the scope it needs and a valid call.
describe('trending, referral, search and reference-data read tool gating', () => {
  registerMcpReadToolGatingTests({
    scopes: [
      'communities:read',
      'topics:read',
      'referral-links:read',
      'web-search:read',
      'reference-data:read',
    ],
    tools: [
      ['get_trending_communities', 'communities:read', {}],
      ['get_trending_referral_programs', 'topics:read', {}],
      ['get_topic_referral_program', 'topics:read', { topic_id: 'some-topic' }],
      ['get_my_referral_links', 'referral-links:read', {}],
      ['search_web', 'web-search:read', { query: 'some words' }],
      ['list_countries', 'reference-data:read', {}],
      ['list_currencies', 'reference-data:read', {}],
      ['get_platform_stats', 'reference-data:read', {}],
    ],
    pagedTools: [
      'get_trending_communities',
      'get_trending_referral_programs',
      'get_my_referral_links',
      'search_web',
      'list_currencies',
    ],
    requiredArguments: [
      ['get_topic_referral_program', { q: 'some' }],
      ['search_web', {}],
    ],
  })
})
