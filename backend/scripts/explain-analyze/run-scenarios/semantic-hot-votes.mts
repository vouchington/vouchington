import { write } from '@data-stores/psql'
import { seedUuid } from '../seed-data/common.mts'

const SEMANTIC_POST_COUNT = 40_000
/** One of every 400 seeded posts sits on the zero-distance 5% cluster; the rest stay at net 0. */
const POSITIVE_STRIDE = 400

/**
 * Give about 100 of the ~2000 nearest seeded posts a positive net vote for the duration of `run`,
 * so the hot candidate window mostly holds net-0 neighbours but still has real rows to page.
 */
export async function withPositiveSemanticNeighbours<T>(run: () => Promise<T>): Promise<T> {
  const ids = Array.from({ length: SEMANTIC_POST_COUNT / POSITIVE_STRIDE }, (_, index) =>
    seedUuid((index + 1) * POSITIVE_STRIDE - 1, '05'),
  )
  const { rows } = await write<{ id: string; votes_score_up: number }>(
    `/* semanticHotPositiveNeighbours */
     WITH previous AS MATERIALIZED (
       SELECT id, votes_score_up FROM posts WHERE id = ANY($1::uuid[])
     ), bumped AS (
       UPDATE posts SET votes_score_up = posts.votes_score_up + 1
       FROM previous WHERE posts.id = previous.id
     )
     SELECT id, votes_score_up FROM previous`,
    [ids],
  )
  try {
    return await run()
  } finally {
    await write(
      `/* semanticHotRestoreNeighbours */
       UPDATE posts SET votes_score_up = restore.votes_score_up
       FROM unnest($1::uuid[], $2::double precision[]) AS restore(id, votes_score_up)
       WHERE posts.id = restore.id`,
      [rows.map(row => row.id), rows.map(row => row.votes_score_up)],
    )
  }
}
