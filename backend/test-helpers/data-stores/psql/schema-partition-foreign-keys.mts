import { read } from '../../../data-stores/psql/index.mts'

export type DirectPartitionChildForeignKeyRow = {
  owner_table_name: string
  constraint_name: string
  target_child_table_name: string
  target_parent_table_name: string
}

export async function getDirectPartitionChildForeignKeyRows(): Promise<
  DirectPartitionChildForeignKeyRow[]
> {
  const { rows } = await read<DirectPartitionChildForeignKeyRow>(
    `/* getDirectPartitionChildForeignKeyRows */
      SELECT
        owner_table.relname AS owner_table_name,
        foreign_key.conname AS constraint_name,
        target_child.relname AS target_child_table_name,
        target_parent.relname AS target_parent_table_name
      FROM pg_constraint foreign_key
      JOIN pg_class owner_table ON owner_table.oid = foreign_key.conrelid
      JOIN pg_namespace owner_namespace ON owner_namespace.oid = owner_table.relnamespace
      JOIN pg_inherits target_inheritance ON target_inheritance.inhrelid = foreign_key.confrelid
      JOIN pg_class target_child ON target_child.oid = target_inheritance.inhrelid
      JOIN pg_namespace target_child_namespace ON target_child_namespace.oid = target_child.relnamespace
      JOIN pg_class target_parent ON target_parent.oid = target_inheritance.inhparent
      WHERE owner_namespace.nspname = 'public'
        AND target_child_namespace.nspname = 'public'
        AND foreign_key.contype = 'f'
        AND foreign_key.conparentid = 0
      ORDER BY owner_table_name, constraint_name, target_child_table_name`,
  )
  return rows
}
