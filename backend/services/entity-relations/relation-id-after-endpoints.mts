import sql, { type SQLStatement } from 'sql-template-strings'

// Relation tables require `id` to sort after the subject and, on many predicates, the object.
// A bare `uuidv7()` default uses the database clock. Explain seeds stamp the newest post at noon
// UTC, so a run before noon minted an id behind that post and the check rejected the insert.
// One second after the newer endpoint clears a same-millisecond tie. When both endpoints are
// already behind the clock, `GREATEST` keeps the current `uuidv7()`.
export function appendRelationIdAfterEndpoints(query: SQLStatement): void {
  query.append(sql`GREATEST(
          uuidv7(),
          uuidv7(COALESCE(
            GREATEST(
              uuid_extract_timestamp(input.subject_id),
              uuid_extract_timestamp(input.object_id)
            ) + interval '1 second' - clock_timestamp(),
            interval '0'
          ))
        )`)
}
