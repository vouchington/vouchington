import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { getTopicMetricsByAny } from '@services/topics/metrics'

type ToolArgs = {
  topic_id: string
}

type ToolResult =
  | {
      success: true
      topic_id: string
      discussions: number
      reviews: number
      data_points: number
      news: number
      followers: number
      ratings: {
        count_1: number
        count_2: number
        count_3: number
        count_4: number
        count_5: number
      }
    }
  | {
      success: false
      error: string
    }

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_topic_metrics',
    type: 'function',
    description:
      'Get engagement metrics for a topic: post counts by type (discussions, reviews, data points, news), follower count, and star rating distribution. Useful for gauging how active and well-reviewed a card or product is.',
    parameters: {
      type: 'object',
      properties: {
        topic_id: {
          type: 'string',
          description: 'The topic UUID to retrieve metrics for',
        },
      },
      required: ['topic_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: null,
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const metrics = await getTopicMetricsByAny(args.topic_id)

      if (!metrics) {
        return { success: false, error: 'Topic not found' }
      }

      return {
        success: true,
        topic_id: metrics.id,
        discussions: metrics.count.discussions,
        reviews: metrics.count.reviews,
        data_points: metrics.count['data-points'],
        news: metrics.count.news,
        followers: metrics.bookmarks.follow,
        ratings: {
          count_1: metrics.ratings.count['1'],
          count_2: metrics.ratings.count['2'],
          count_3: metrics.ratings.count['3'],
          count_4: metrics.ratings.count['4'],
          count_5: metrics.ratings.count['5'],
        },
      }
    },
}

export default tool
