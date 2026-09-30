import { objectSchema, outcomeSchema } from './output-schema-shapes.mts'
import {
  CONTENT_COUNT_PROPERTIES,
  FOLLOWERS_SCHEMA,
  RATINGS_COUNT_SCHEMA,
} from './topic-output-schema-parts.mts'

const votes = { type: 'integer' }

// The tool has no REST twin, so it owns this schema. The source topic and RSS feed appear only when
// the URL maps to an RSS source.
export const GET_DOMAIN_RATINGS_OUTPUT_SCHEMA = outcomeSchema(
  'success',
  {
    hostname: { type: 'string' },
    hostname_id: { type: 'string' },
    domain_trust: objectSchema({
      votes_score_net: votes,
      votes_count_up: votes,
      votes_count_down: votes,
    }),
    source_topic: objectSchema({
      topic_id: { type: 'string' },
      topic_slug: { type: 'string' },
      topic_title: { type: 'string' },
      ratings: RATINGS_COUNT_SCHEMA,
      content_counts: objectSchema(CONTENT_COUNT_PROPERTIES),
      followers: FOLLOWERS_SCHEMA,
    }),
    rss_feed: objectSchema({ rss_feed_id: { type: 'string' }, title: { type: 'string' } }),
  },
  ['source_topic', 'rss_feed'],
)
