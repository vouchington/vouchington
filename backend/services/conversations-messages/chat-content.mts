import sql from 'sql-template-strings'

type AppendableSql = {
  append: (statement: ReturnType<typeof sql>) => unknown
}

/** Appends the public message columns to an `INSERT ... RETURNING` statement. */
export function appendConversationMessageReturning(query: AppendableSql): void {
  query.append(sql`
    id,
    conversation_id,
    created_at,
    created_by_id,
    updated_at,
    updated_by_id,
    deleted_at,
    deleted_by_id,
    content
  `)
}
