import { componentSchema } from './route-response-schema.mts'
import { nullable, objectSchema, type JsonSchema } from './output-schema-shapes.mts'

const count: JsonSchema = { type: 'integer', minimum: 0 }

/** Aggregate data point statistics, as `getTopicDataPointInsights` returns them. */
export const INSIGHTS_PROPERTIES: Record<string, JsonSchema> = {
  total_count: count,
  approved_count: count,
  denied_count: count,
  pending_count: count,
  approval_rate: nullable({ type: 'number', minimum: 0, maximum: 1 }),
  median_credit_limits: { type: 'array', items: componentSchema('Money') },
  credit_score_distribution: { type: 'object', additionalProperties: count },
}

/** Post counts by type, flattened the way the topic tools name them. */
export const CONTENT_COUNT_PROPERTIES: Record<string, JsonSchema> = {
  discussions: count,
  reviews: count,
  data_points: count,
  news: count,
}

/** The star rating distribution, flattened to `count_1` through `count_5`. */
export const RATINGS_COUNT_SCHEMA = objectSchema(
  Object.fromEntries([1, 2, 3, 4, 5].map(stars => [`count_${stars}`, count])),
)

export const FOLLOWERS_SCHEMA = count
