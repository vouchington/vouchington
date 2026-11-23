import sql, { type SQLStatement } from 'sql-template-strings'

export function buildNonDeletedClause(candidateAlias: string, rootAlias: string): SQLStatement {
  return sql`(`
    .append(`${candidateAlias}.deleted_at IS NULL`)
    .append(sql` AND `)
    .append(`${rootAlias}.deleted_at IS NULL`)
    .append(sql` AND `)
    .append(buildLivePostAuthorsClause(candidateAlias, rootAlias))
    .append(sql`)`)
}

/** Author deletion fences content even before post ownership is reassigned. */
export function buildLivePostAuthorsClause(
  candidateAlias: string,
  rootAlias: string,
): SQLStatement {
  // Scalar primary-key lookups keep these fences out of publication join enumeration.
  const statement = sql`(COALESCE((
      SELECT publication_candidate_author.deleted_at IS NULL
      FROM users publication_candidate_author
      WHERE publication_candidate_author.id = `
    .append(`${candidateAlias}.created_by_id`)
    .append(sql`), TRUE)`)
  if (candidateAlias === rootAlias) return statement.append(sql`)`)
  return statement
    .append(sql` AND COALESCE((
      SELECT publication_root_author.deleted_at IS NULL
      FROM users publication_root_author
      WHERE publication_root_author.id = `)
    .append(`${rootAlias}.created_by_id`)
    .append(sql`), TRUE))`)
}
