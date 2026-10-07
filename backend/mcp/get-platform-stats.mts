import { getPlatformStatsCached } from '@services/entity-fetch/search-caches'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { successSchema } from './output-schema-shapes.mts'
import { pickProperties } from './read-tool-output-schema.mts'

type ToolResult = {
  success: true
  topic_count: number
  rss_feed_count: number
  post_count: number
  review_count: number
  data_point_count: number
  hostname_count: number
}

const tool: Tool<Record<string, never>, ToolResult> = {
  schema: {
    name: 'get_platform_stats',
    type: 'function',
    description:
      'Get Voucha-wide counts: topics, enabled RSS feeds, public posts, reviews, data points and trusted hostnames. The counts are cached for a short time, so they can trail the database slightly.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get Platform Stats',
    requiredScopes: { mcp: ['reference-data:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/platform-stats' }],
    outputSchema: successSchema(
      pickProperties('PlatformStats', [
        'topic_count',
        'rss_feed_count',
        'post_count',
        'review_count',
        'data_point_count',
        'hostname_count',
      ]),
    ),
  },
  function: (_currentUser: BasicUser) => async (): Promise<ToolResult> => {
    const stats = await getPlatformStatsCached({})
    return {
      success: true,
      topic_count: stats.topic_count,
      rss_feed_count: stats.rss_feed_count,
      post_count: stats.post_count,
      review_count: stats.review_count,
      data_point_count: stats.data_point_count,
      hostname_count: stats.hostname_count,
    }
  },
}

export default tool
