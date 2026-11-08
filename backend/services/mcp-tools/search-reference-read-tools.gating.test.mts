import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { describe, expect, it } from 'vitest'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import { registerMcpReadToolGatingTests } from '@voucha/test-helpers/mcp-read-tool-gating'

// Every tool of the trending, referral, search and reference-data families, the scope it needs and a valid call.
describe('trending, referral, search and reference-data read tool gating', () => {
  it('exposes one referral reader without the former alias', () => {
    const names = ALL_TOOLS.map(tool => tool.schema.name)
    expect(names.filter(name => name === 'get_referral_links')).toHaveLength(1)
    expect(names).not.toContain('get_my_referral_links')
  })

  registerMcpReadToolGatingTests({
    scopes: [
      'communities:read',
      'topics:read',
      'referral-links:read',
      'web-search:read',
      'reference-data:read',
    ],
    tools: [
      ['discover_communities', 'communities:read', optionArgs('search', {})],
      ['discover_topics', 'topics:read', optionArgs('search', { sort: 'link_count' })],
      ['read_topic', 'topics:read', optionArgs('details', { topic_id: 'some-topic' })],
      ['get_referral_links', 'referral-links:read', {}],
      ['search_web', 'web-search:read', { query: 'some words' }],
      ['read_reference_data', 'reference-data:read', optionArgs('countries', {})],
      ['read_reference_data', 'reference-data:read', optionArgs('currencies', {})],
      ['read_reference_data', 'reference-data:read', optionArgs('platform_stats', {})],
    ],
    // The no-topic referral list uses the REST page-size contract, not the 1 through 25 cap.
    pagedTools: [
      ['discover_communities', 'search'],
      ['search_web'],
      ['read_reference_data', 'currencies'],
    ],
    requiredArguments: [
      ['read_topic', optionArgs('details', { q: 'some' })],
      ['search_web', {}],
    ],
  })
})
