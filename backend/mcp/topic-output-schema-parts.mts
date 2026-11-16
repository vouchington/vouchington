import { componentSchema } from './route-response-schema.mts'
import { nullable, objectSchema, type JsonSchema } from '@vouchington/mcp-server/schema'

export const countSchema: JsonSchema = { type: 'integer', minimum: 0 }

/** Aggregate data point statistics, as `getTopicDataPointInsights` returns them. */
export const INSIGHTS_PROPERTIES: Record<string, JsonSchema> = {
  total_count: countSchema,
  approved_count: countSchema,
  denied_count: countSchema,
  pending_count: countSchema,
  approval_rate: nullable({ type: 'number', minimum: 0, maximum: 1 }),
  median_credit_limits: { type: 'array', items: componentSchema('Money') },
  credit_score_distribution: { type: 'object', additionalProperties: countSchema },
}

/** Post counts by type, flattened the way the topic tools name them. */
export const CONTENT_COUNT_PROPERTIES: Record<string, JsonSchema> = {
  discussions: countSchema,
  reviews: countSchema,
  data_points: countSchema,
  news: countSchema,
}

/** The star rating distribution, flattened to `count_1` through `count_5`. */
export const RATINGS_COUNT_SCHEMA = objectSchema(
  Object.fromEntries([1, 2, 3, 4, 5].map(stars => [`count_${stars}`, countSchema])),
)
