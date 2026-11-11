import { SEEDED_ROWS_BY_RELATION } from './plan-seeded-rows.mts'

/** Row totals for captures made while the late post-discovery fixture is present. */
export const POST_DISCOVERY_FIXTURE_SEEDED_ROWS: Readonly<Record<string, number>> = {
  posts: SEEDED_ROWS_BY_RELATION.posts! + 20_200,
  community_post_reviews: SEEDED_ROWS_BY_RELATION.community_post_reviews! + 10_400,
  communities: SEEDED_ROWS_BY_RELATION.communities! + 2,
  post_clearance_changes: SEEDED_ROWS_BY_RELATION.post_clearance_changes! + 20_200,
  post_topic_recommendations: SEEDED_ROWS_BY_RELATION.post_topic_recommendations! + 200,
}

/** Row totals while the discovery and topic-semi-join fixtures overlap. */
export const POST_TOPIC_FIXTURES_SEEDED_ROWS: Readonly<Record<string, number>> = {
  ...POST_DISCOVERY_FIXTURE_SEEDED_ROWS,
  topics: SEEDED_ROWS_BY_RELATION.topics! + 2,
  topic_aliases: SEEDED_ROWS_BY_RELATION.topic_aliases! + 80,
  relation__post__category__topic_alias:
    SEEDED_ROWS_BY_RELATION.relation__post__category__topic_alias! + 10_005,
  relation__post__category__topic: SEEDED_ROWS_BY_RELATION.relation__post__category__topic! + 2,
}
