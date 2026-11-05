import { write } from '@data-stores/psql'

type RelatedTopicScore = { topicId: string; up: number; down: number; createdAt: string }

/** Insert owned relation fixtures with independently controlled vote weights and tie times. */
export async function insertPostRelatedTopicRankingFixture(
  postId: string,
  entries: RelatedTopicScore[],
): Promise<void> {
  await write(
    `/* insertPostRelatedTopicRankingFixture */
    INSERT INTO relation__post__category__topic
      (subject_id, object_id, votes_score_up, votes_score_down, created_at)
    SELECT $1::uuid, topic_id, score_up, score_down, created_at
    FROM unnest($2::uuid[], $3::double precision[], $4::double precision[], $5::timestamptz[])
      AS fixture(topic_id, score_up, score_down, created_at)`,
    [
      postId,
      entries.map(x => x.topicId),
      entries.map(x => x.up),
      entries.map(x => x.down),
      entries.map(x => x.createdAt),
    ],
  )
}
