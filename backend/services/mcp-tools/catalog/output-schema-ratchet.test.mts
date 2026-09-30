import { ALL_TOOLS } from '@voucha/tools/registry/index'
import { describe, expect, it } from 'vitest'
import { buildMcpCatalog } from './build-mcp-catalog.mts'
import {
  MAX_MCP_TOOLS_WITHOUT_OUTPUT_SCHEMA,
  MCP_TOOLS_WITHOUT_OUTPUT_SCHEMA,
} from './output-schema-ratchet.mts'

describe('MCP output schema ratchet', () => {
  const listed = buildMcpCatalog(ALL_TOOLS).servers.flatMap(server => server.tools)
  const withoutSchema = [
    ...new Set(listed.filter(({ tool }) => !tool.outputSchema).map(({ tool }) => tool.name)),
  ].toSorted()

  it('names exactly the listed tools that declare no output schema', () => {
    // A tool missing here needs an output schema; a name listed here but converted is stale.
    expect(withoutSchema).toEqual(MCP_TOOLS_WITHOUT_OUTPUT_SCHEMA)
  })

  it('can only shrink', () => {
    expect(MCP_TOOLS_WITHOUT_OUTPUT_SCHEMA.length).toBeLessThanOrEqual(
      MAX_MCP_TOOLS_WITHOUT_OUTPUT_SCHEMA,
    )
  })

  it('keeps the list sorted and free of duplicates', () => {
    expect(MCP_TOOLS_WITHOUT_OUTPUT_SCHEMA).toEqual(
      [...new Set(MCP_TOOLS_WITHOUT_OUTPUT_SCHEMA)].toSorted(),
    )
  })

  it.each([
    'add_entity_relation',
    'compare_topics',
    'get_domain_ratings',
    'get_my_cards',
    'get_my_point_valuations',
    'get_my_profile',
    'get_my_rewards_statuses',
    'get_my_spending',
    'get_recommended_topics',
    'get_referral_links',
    'get_topic_details',
    'get_topic_insights',
    'get_topic_metrics',
    'get_wikipedia_summary',
    'manage_my_cards',
    'manage_my_point_valuations',
    'manage_my_rewards_statuses',
    'manage_my_spending',
    'search_data_points',
    'search_wikipedia',
    'update_my_financial_profile',
  ])('lists %s with an output schema', name => {
    const entry = listed.find(({ tool }) => tool.name === name)

    expect(entry?.tool.outputSchema).toMatchObject({ type: 'object' })
  })
})
