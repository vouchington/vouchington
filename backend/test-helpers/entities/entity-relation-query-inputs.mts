import sql from 'sql-template-strings'

export function createUserFollowRelationUpdateStatementForTest(): ReturnType<typeof sql> {
  return sql`UPDATE relation__user__follow__user SET deleted_at = NOW()`
}

export function createUserMuteRelationUpdateStatementForTest(): ReturnType<typeof sql> {
  return sql`UPDATE relation__user__mute__user SET deleted_at = NOW()`
}
