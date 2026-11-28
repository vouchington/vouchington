import { read } from '@data-stores/psql'

export type ElectionVoteStatsSnapshotColumn = {
  table_name: string
  column_name: string
  type: string
  comment: string | null
}

export async function getElectionVoteStatsSnapshotColumns(
  entityTables: string[],
): Promise<ElectionVoteStatsSnapshotColumn[]> {
  const { rows } = await read<ElectionVoteStatsSnapshotColumn>(
    `/* getElectionVoteStatsSnapshotColumns */
      SELECT relation.relname AS table_name, attribute.attname AS column_name,
        format_type(attribute.atttypid, attribute.atttypmod) AS type,
        col_description(relation.oid, attribute.attnum) AS comment
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
      WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
        AND attribute.attname IN ('votes_snapshot_xmax', 'votes_snapshot_xip_count')
      ORDER BY table_name, column_name`,
    [entityTables],
  )
  return rows
}

export type ElectionVoteStatsSnapshotCheck = {
  table_name: string
  constraint_name: string
  definition: string
}

export async function getElectionVoteStatsSnapshotChecks(
  entityTables: string[],
): Promise<ElectionVoteStatsSnapshotCheck[]> {
  const { rows } = await read<ElectionVoteStatsSnapshotCheck>(
    `/* getElectionVoteStatsSnapshotChecks */
      SELECT relation.relname AS table_name, constraint_record.conname AS constraint_name,
        pg_get_constraintdef(constraint_record.oid) AS definition
      FROM pg_constraint constraint_record
      JOIN pg_class relation ON relation.oid = constraint_record.conrelid
      WHERE constraint_record.contype = 'c' AND relation.relname = ANY($1::text[])
        AND pg_get_constraintdef(constraint_record.oid) LIKE '%votes_snapshot_xmax%'
      ORDER BY table_name`,
    [entityTables],
  )
  return rows
}

export type ElectionVoteStatsVoteForeignKey = {
  table_name: string
  definition: string
}

export async function getElectionVoteStatsVoteForeignKeys(
  entityTables: string[],
  voteTables: string[],
): Promise<ElectionVoteStatsVoteForeignKey[]> {
  const { rows } = await read<ElectionVoteStatsVoteForeignKey>(
    `/* getElectionVoteStatsVoteForeignKeys */
      SELECT relation.relname AS table_name, pg_get_constraintdef(constraint_record.oid) AS definition
      FROM pg_constraint constraint_record
      JOIN pg_class relation ON relation.oid = constraint_record.conrelid
      JOIN pg_class referenced_relation ON referenced_relation.oid = constraint_record.confrelid
      WHERE constraint_record.contype = 'f' AND relation.relname = ANY($1::text[])
        AND referenced_relation.relname = ANY($2::text[])
      ORDER BY table_name, definition`,
    [entityTables, voteTables],
  )
  return rows
}

export async function getRetiredElectionVoteStatsColumns(
  entityTables: string[],
): Promise<{ table_name: string }[]> {
  const { rows } = await read<{ table_name: string }>(
    `/* getRetiredElectionVoteStatsColumns */
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
        AND column_name = '_last_vote_id'`,
    [entityTables],
  )
  return rows
}
