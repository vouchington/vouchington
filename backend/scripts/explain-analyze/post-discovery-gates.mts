import { registerScenarioContract } from './plan-expectations.mts'
import { POST_DISCOVERY_FIXTURE_SEEDED_ROWS } from './post-discovery-seeded-rows.mts'

export type PostDiscoveryScope = 'community' | 'recommendation'
export type PostDiscoverySort = 'new' | 'best' | 'hot' | 'trending'

const EXPECTED_POST_WORK = 3010

export function registerPostDiscoveryGate(
  id: string,
  scope: PostDiscoveryScope,
  sort: PostDiscoverySort,
  allowEmpty = false,
): void {
  const indexes =
    scope === 'community'
      ? {
          new: 'posts__default_community_id_id_idx',
          best: 'posts__default_community_id_votes_score_sort_id_idx',
          hot: [
            'posts__default_community_id_case_id_votes_score_sort_idx',
            'posts__default_case_id_votes_score_sort_idx',
            'posts__default_votes_score_sort_id_idx3',
          ],
          trending: [
            'posts__default_community_id_case_id_votes_score_sort_idx',
            'posts__default_case_id_votes_score_sort_idx',
            'posts__default_votes_score_sort_id_idx3',
          ],
        }
      : {
          new: 'posts__default_id_idx7',
          best: 'posts__default_votes_score_sort_id_idx1',
          hot: 'posts__default_post_type_case_id_idx',
          trending: 'posts__default_post_type_case_id_idx',
        }
  registerScenarioContract(id, {
    seededRows: POST_DISCOVERY_FIXTURE_SEEDED_ROWS,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: EXPECTED_POST_WORK },
      { kind: 'maxBitmapIndexRows', max: 1050 },
      {
        kind: 'usesIndexes',
        indexes: Array.isArray(indexes[sort]) ? indexes[sort] : [indexes[sort]],
        ...(Array.isArray(indexes[sort]) ? { anyOf: true } : {}),
      },
      ...(scope === 'community'
        ? [{ kind: 'maxProcessedRows' as const, relation: 'community_post_reviews', max: 2010 }]
        : [
            {
              kind: 'maxProcessedRows' as const,
              relation: 'post_topic_recommendations',
              max: 2010,
            },
          ]),
    ],
    allowEmptyResult: allowEmpty,
    crossPartition: {
      posts: `${scope} ${sort} discovery traverses the retained post history through a bounded candidate window.`,
    },
  })
}
