import { v7 } from 'uuid'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser } from './entities/users.mts'
import { insertTestPost } from './entities/posts.mts'
import { insertTestPostVote } from './entities/vote-integrity.mts'

/** Insert four owned ballots on two completed UTC days, then delete through the partitioned parent. */
export async function deleteTestPostVotesAcrossCompletedDays(): Promise<{
  sourceDays: string[]
  deletedVoteCount: number
  storageRelations: string[]
  deletionCounts: Array<{ day: string; count: number }>
}> {
  const author = await createTestUser()
  const firstVoter = await createTestUser()
  const secondVoter = await createTestUser()
  const postIds = await Promise.all(
    [0, 1].map(async index =>
      insertTestPost({
        title: `Reporting vote deletion ${index} ${v7()}`,
        slug: `reporting-vote-deletion-${index}-${v7()}`,
        markdown: 'Owned reporting lifecycle fixture',
        createdById: author.id,
      }),
    ),
  )

  const now = new Date()
  const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 10))
  const secondDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 10))
  const sourceDays = [firstDay, secondDay].map(day => day.toISOString().slice(0, 10))
  const voters = [firstVoter.id, secondVoter.id]

  await using transaction = await beginTransaction({ isolationLevel: 'repeatable read' })
  const ballots = [
    { postId: postIds[0]!, userId: voters[0]!, day: firstDay, offset: 1 },
    { postId: postIds[1]!, userId: voters[0]!, day: firstDay, offset: 2 },
    { postId: postIds[0]!, userId: voters[1]!, day: secondDay, offset: 1 },
    { postId: postIds[1]!, userId: voters[1]!, day: secondDay, offset: 2 },
  ]
  for (const [index, ballot] of ballots.entries()) {
    const id = v7({ msecs: ballot.day.getTime() + ballot.offset })
    await insertTestPostVote(
      ballot.postId,
      ballot.userId,
      `192.0.2.${index + 1}`,
      1,
      id,
      transaction,
    )
  }

  const { rows: relationRows } = await transaction<{ relation_name: string }>(
    sql`/* readTestPostVoteStorageRelations */
    SELECT DISTINCT tableoid::regclass::text AS relation_name
    FROM post_votes
    WHERE post_id = ANY(${postIds}::uuid[])
  `,
  )
  const { rows: deletedRows } = await transaction<{ id: string }>(
    sql`/* deleteTestPostVotesAcrossCompletedDays */
    DELETE FROM post_votes WHERE post_id = ANY(${postIds}::uuid[]) RETURNING id
  `,
  )
  const { rows: deletionCounts } = await transaction<{ day: string; count: number }>(
    sql`/* readTestOwnedPostVoteDeletionDays */
    SELECT source_on::text AS day, count(*)::int AS count
    FROM reporting_source_day_events
    WHERE xmin = pg_current_xact_id()::text::xid
      AND source_type = 'post_vote_deletion'
      AND source_on = ANY(${sourceDays}::date[])
    GROUP BY source_on
    ORDER BY source_on
  `,
  )

  return {
    sourceDays,
    deletedVoteCount: deletedRows.length,
    storageRelations: relationRows.map(row => row.relation_name),
    deletionCounts,
  }
}
