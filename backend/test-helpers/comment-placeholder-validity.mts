import { read } from '@data-stores/psql'
import { buildCommentIsValidSql } from '@services/comments/placeholder-sql'
import sql from 'sql-template-strings'

export type TestCommentStateRow = {
  deleted_at: Date | null
  approved_at: Date | null
  created_by_id: string | null
}

/** The columns the TypeScript placeholder state is decided from. */
export async function readTestCommentStateRow(postId: string): Promise<TestCommentStateRow> {
  const { rows } = await read<TestCommentStateRow>(
    sql`/* readTestCommentStateRow */
    SELECT deleted_at, approved_at, created_by_id FROM posts WHERE id = ${postId}`,
  )
  return rows[0]!
}

/** What the walk's SQL validity check says about a comment for one viewer. */
export async function readTestCommentSqlValidity(
  postId: string,
  viewer: { currentUserId: string | null; isModerationStaff: boolean },
): Promise<boolean> {
  const query = sql`/* readTestCommentSqlValidity */ SELECT `
    .append(buildCommentIsValidSql('c', viewer))
    .append(sql` AS valid FROM posts c WHERE c.id = ${postId}`)
  const { rows } = await read<{ valid: boolean }>(query)
  return rows[0]!.valid
}
