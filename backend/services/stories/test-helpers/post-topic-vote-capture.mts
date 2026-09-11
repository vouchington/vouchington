import { getEntityRelation } from '@voucha/test-helpers'
import {
  createEntityRelationElectionTarget,
  updateEntityRelationElectionVoteStatsFromPrimary,
} from '@services/elections-votes/entity-relation'

export async function settleStoryPostTopicVoteCapture(
  postId: string,
  topicId: string,
): Promise<void> {
  const [relation] = (await getEntityRelation(
    'relation__post__category__topic',
    postId,
    topicId,
  )) as Array<{ id: string }>
  if (!relation) throw new Error('Expected story post topic relation')
  await updateEntityRelationElectionVoteStatsFromPrimary(
    createEntityRelationElectionTarget(relation.id, 'relation__post__category__topic'),
  )
}
