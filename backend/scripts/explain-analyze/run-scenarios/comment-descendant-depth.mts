import { getVisibleCommentDescendantIdsPage } from '@services/comments'
import { registerScenarioContract } from '../plan-expectations.mts'
import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { COMMENT_DESCENDANT_DEPTH_ROOT_ID } from '../seed-data/comment-descendant-depth.mts'
import {
  COMMENT_DESCENDANT_QUERY_ANNOTATIONS,
  assertScenarioReadBudget,
} from './comment-descendant-page-budget.mts'

export async function runCommentDescendantDepthScenario(): Promise<void> {
  registerScenarioContract('comment-descendants-depth-bound', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 100 }],
    forbidSequentialScans: ['posts'],
    seededRows: { posts: SEEDED_ROWS_BY_RELATION.posts! + 936 },
    crossPartition: {
      posts: 'A comment thread may contain replies from later UUIDv7 post partitions.',
    },
  })
  await runAndCapture(
    'comment-descendants-depth-bound',
    () =>
      getVisibleCommentDescendantIdsPage(
        seedUser,
        COMMENT_DESCENDANT_DEPTH_ROOT_ID,
        COMMENT_DESCENDANT_DEPTH_ROOT_ID,
        { limit: 100 },
      ),
    undefined,
    COMMENT_DESCENDANT_QUERY_ANNOTATIONS,
  )
  assertScenarioReadBudget('comment-descendants-depth-bound', 100)
}
