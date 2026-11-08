import { registerScenarioContract } from './plan-expectations.mts'

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
          hot: 'posts__default_community_id_case_id_idx',
          trending: 'posts__default_community_id_case_id_idx',
        }
      : {
          new: 'posts__default_id_idx7',
          best: 'posts__default_votes_score_sort_id_idx1',
          hot: 'posts__default_post_type_case_id_idx',
          trending: 'posts__default_post_type_case_id_idx',
        }
  registerScenarioContract(id, {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: EXPECTED_POST_WORK },
      { kind: 'maxBitmapIndexRows', max: 1050 },
      { kind: 'usesIndexes', indexes: [indexes[sort]] },
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
