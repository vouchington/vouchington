import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * The event types the database accepts for `copyright_notice_lifecycle_events.event_type`, read
 * from its single-column CHECK constraint so a schema change is visible to tests without a
 * second hand-kept list.
 */
export async function readCopyrightLifecycleEventTypes(): Promise<string[]> {
  const { rows } = await read<{ definition: string }>(sql`/* readCopyrightLifecycleEventTypes */
    SELECT pg_get_constraintdef(check_constraint.oid) AS definition
    FROM pg_constraint check_constraint
    JOIN pg_attribute event_type_column
      ON event_type_column.attrelid = check_constraint.conrelid
      AND event_type_column.attnum = check_constraint.conkey[1]
    WHERE check_constraint.conrelid = 'copyright_notice_lifecycle_events'::regclass
      AND check_constraint.contype = 'c'
      AND array_length(check_constraint.conkey, 1) = 1
      AND event_type_column.attname = 'event_type'
  `)
  if (rows.length !== 1 || !rows[0]) {
    throw new Error(`Expected one event_type CHECK constraint, found ${rows.length}`)
  }
  const eventTypes = [...rows[0].definition.matchAll(/'([a-z_]+)'::text/g)].map(match => match[1]!)
  if (eventTypes.length === 0) throw new Error('The event_type CHECK constraint lists no values')
  return eventTypes
}
