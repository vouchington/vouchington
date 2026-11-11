import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'
import { POST_TOPIC_SEMI_JOIN_FIXTURE } from './post-topic-semi-join-fixture.mts'
import { POST_TOPIC_OWNED_IDS } from './post-topic-owned-posts.mts'

/** Delete only this fixture's relation, aliases, and topic rows after late EXPLAIN captures. */
export async function cleanupPostTopicSemiJoinFixture(): Promise<void> {
  const fixture = POST_TOPIC_SEMI_JOIN_FIXTURE
  const aliasIds = [...fixture.sparseAliasIds, ...fixture.denseAliasIds]
  const topicIds = [fixture.sparseTopicId, fixture.denseTopicId]

  await using transaction = await beginTransaction()
  await transaction(
    '/* cleanupPostTopicSemiJoinFixture:owned-viewer-topic-follows */ DELETE FROM relation__user__follow__topic WHERE subject_id = $1::uuid AND object_id = ANY($2::uuid[])',
    [seedUuid(0, '01'), topicIds],
  )
  await transaction(
    '/* cleanupPostTopicSemiJoinFixture:relations */ DELETE FROM relation__post__category__topic_alias WHERE object_id = ANY($1::uuid[])',
    [aliasIds],
  )
  await transaction(
    '/* cleanupPostTopicSemiJoinFixture:feed-topic-relation */ DELETE FROM relation__post__category__topic WHERE object_id = ANY($1::uuid[])',
    [topicIds],
  )
  await transaction(
    '/* cleanupPostTopicSemiJoinFixture:aliases */ DELETE FROM topic_aliases WHERE id = ANY($1::uuid[])',
    [aliasIds],
  )
  await transaction(
    '/* cleanupPostTopicSemiJoinFixture:topics */ DELETE FROM topics WHERE id = ANY($1::uuid[])',
    [topicIds],
  )
  await transaction(
    '/* cleanupPostTopicSemiJoinFixture:owned-feed-post */ DELETE FROM posts WHERE id = ANY($1::uuid[])',
    [POST_TOPIC_OWNED_IDS],
  )
  await transaction.commit()
}
