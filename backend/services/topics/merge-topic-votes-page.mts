import type { TransactionQuery } from '@data-stores/psql'

/** Freeze the winner per voter before moving any of that voter's append-only history. */
export async function processTopicMergeVoteReferencePage(
  query: TransactionQuery,
  operationId: string,
  sourceId: string,
  destinationId: string,
  limit: number,
): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `/* processTopicMergeVoteReferencePage choose */ WITH page AS MATERIALIZED (
      SELECT id, user_id FROM topic_votes
      WHERE topic_id = $2::uuid ORDER BY id LIMIT $4::integer FOR UPDATE
    ), authors AS (SELECT DISTINCT user_id FROM page), chosen AS (
      INSERT INTO topic_merge_metric_users (operation_id, user_id, original_vote_topic_id)
      SELECT $1::uuid, author.user_id,
        CASE WHEN EXISTS (
          SELECT 1 FROM topic_votes destination
          WHERE destination.topic_id = $3::uuid AND destination.user_id = author.user_id
        ) THEN $3::uuid ELSE $2::uuid END
      FROM authors author ORDER BY author.user_id
      ON CONFLICT (operation_id, user_id) DO NOTHING RETURNING user_id
    ) SELECT page.id FROM page CROSS JOIN (SELECT COUNT(*) FROM chosen) admitted ORDER BY page.id`,
    [operationId, sourceId, destinationId, limit],
  )
  if (!rows.length) return 0
  const ids = rows.map(row => row.id)
  const { rows: applied } = await query<{ consumed: number }>(
    `/* processTopicMergeVoteReferencePage apply */ WITH page AS MATERIALIZED (
      SELECT vote.id, owner.original_vote_topic_id
      FROM topic_votes vote
      JOIN topic_merge_metric_users owner
        ON owner.operation_id = $1::uuid AND owner.user_id = vote.user_id
      WHERE vote.topic_id = $2::uuid AND vote.id = ANY($4::uuid[])
      ORDER BY vote.id
      FOR UPDATE OF vote
    ), removed AS (
      DELETE FROM topic_votes vote USING page
      WHERE vote.topic_id = $2::uuid AND vote.id = page.id
        AND page.original_vote_topic_id = $3::uuid RETURNING vote.id
    ), moved AS (
      UPDATE topic_votes vote SET topic_id = $3::uuid FROM page
      WHERE vote.topic_id = $2::uuid AND vote.id = page.id
        AND page.original_vote_topic_id = $2::uuid RETURNING vote.id
    ) SELECT ((SELECT COUNT(*) FROM removed) + (SELECT COUNT(*) FROM moved))::integer AS consumed`,
    [operationId, sourceId, destinationId, ids],
  )
  const consumed = applied[0]!.consumed
  if (consumed !== ids.length) throw new Error('Topic merge vote page lost its frozen owner')
  return consumed
}
