import { write } from '@data-stores/psql'

/** Seed owned vote tallies that distinguish Wilson ranking from net-score filtering. */
export async function insertHackerNewsRelatedUrlsForTest(
  postId: string,
  userId: string,
  rows: readonly { urlId: string; up: number; down?: number; none?: number; deleted?: boolean }[],
): Promise<void> {
  await write(
    `/* insertHackerNewsRelatedUrlsForTest */
    INSERT INTO relation__post__related__url
      (subject_id, object_id, created_by_id, votes_score_up, votes_score_down, votes_score_none, deleted_at)
    SELECT $1::uuid, url_id, $2::uuid, up, down, none,
      CASE WHEN deleted THEN CURRENT_TIMESTAMP END
    FROM jsonb_to_recordset($3::jsonb) AS x(url_id uuid, up double precision,
      down double precision, none double precision, deleted boolean)`,
    [
      postId,
      userId,
      JSON.stringify(
        rows.map(row => ({
          url_id: row.urlId,
          up: row.up,
          down: row.down ?? 0,
          none: row.none ?? 0,
          deleted: row.deleted ?? false,
        })),
      ),
    ],
  )
}
