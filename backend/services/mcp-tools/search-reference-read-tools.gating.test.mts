import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
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
      ['discover_communities', 'communities:read', optionArgs('trending', {})],
      ['discover_topics', 'topics:read', optionArgs('trending_referral_programs', {})],
      ['read_topic', 'topics:read', optionArgs('referral_program', { topic_id: 'some-topic' })],
      ['get_my_referral_links', 'referral-links:read', {}],
      ['search_web', 'web-search:read', { query: 'some words' }],
      ['read_reference_data', 'reference-data:read', optionArgs('countries', {})],
      ['read_reference_data', 'reference-data:read', optionArgs('currencies', {})],
      ['read_reference_data', 'reference-data:read', optionArgs('platform_stats', {})],
    ],
    pagedTools: [
      ['discover_communities', 'trending'],
      ['discover_topics', 'trending_referral_programs'],
      ['get_my_referral_links'],
      ['search_web'],
      ['read_reference_data', 'currencies'],
    ],
    requiredArguments: [
      ['read_topic', optionArgs('referral_program', { q: 'some' })],
      ['search_web', {}],
    ],
  })
})
