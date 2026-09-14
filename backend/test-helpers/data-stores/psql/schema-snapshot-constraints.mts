import { read } from '../../../data-stores/psql/index.mts'

type PartitionConstraintRow = {
  table_name: string
  constraint_name: string
  contype: 'c' | 'f' | 'p' | 'u'
  definition: string
}

export type DerivedPartitionConstraintRow = {
  derived: PartitionConstraintRow
  parent: PartitionConstraintRow
}

export async function getDerivedPartitionConstraintRows(): Promise<
  DerivedPartitionConstraintRow[]
> {
  const { rows } = await read<{
    derived_table_name: string
    derived_constraint_name: string
    derived_contype: 'c' | 'f' | 'p' | 'u'
    derived_definition: string
    parent_table_name: string
    parent_constraint_name: string
    parent_contype: 'c' | 'f' | 'p' | 'u'
    parent_definition: string
  }>(
    `/* getDerivedPartitionConstraintRows */
      SELECT
        derived_table.relname AS derived_table_name,
        derived_constraint.conname AS derived_constraint_name,
        derived_constraint.contype AS derived_contype,
        pg_get_constraintdef(derived_constraint.oid) AS derived_definition,
        parent_table.relname AS parent_table_name,
        parent_constraint.conname AS parent_constraint_name,
        parent_constraint.contype AS parent_contype,
        pg_get_constraintdef(parent_constraint.oid) AS parent_definition
      FROM pg_constraint derived_constraint
      JOIN pg_constraint parent_constraint
        ON parent_constraint.oid = derived_constraint.conparentid
      JOIN pg_class derived_table ON derived_table.oid = derived_constraint.conrelid
      JOIN pg_namespace derived_namespace ON derived_namespace.oid = derived_table.relnamespace
      JOIN pg_class parent_table ON parent_table.oid = parent_constraint.conrelid
      JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent_table.relnamespace
      WHERE derived_namespace.nspname = 'public'
        AND parent_namespace.nspname = 'public'
        AND derived_table.relkind = ANY($1)
        AND parent_table.relkind = ANY($1)
        AND derived_constraint.contype = ANY($2)
        AND NOT EXISTS (
          SELECT 1 FROM pg_inherits
          WHERE pg_inherits.inhrelid = derived_table.oid
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_inherits
          WHERE pg_inherits.inhrelid = parent_table.oid
        )
      ORDER BY
        derived_table_name,
        derived_contype,
        derived_constraint_name,
        parent_table_name,
        parent_contype,
        parent_constraint_name`,
    [
      ['r', 'p'],
      ['p', 'u', 'c', 'f'],
    ],
  )

  return rows.map(row => ({
    derived: {
      table_name: row.derived_table_name,
      constraint_name: row.derived_constraint_name,
      contype: row.derived_contype,
      definition: row.derived_definition,
    },
    parent: {
      table_name: row.parent_table_name,
      constraint_name: row.parent_constraint_name,
      contype: row.parent_contype,
      definition: row.parent_definition,
    },
  }))
}

export async function getChildOwnedPartitionCheckConstraintRows(): Promise<
  PartitionConstraintRow[]
> {
  const { rows } = await read<PartitionConstraintRow>(
    `/* getChildOwnedPartitionCheckConstraintRows */
      SELECT
        child_table.relname AS table_name,
        constraint_definition.conname AS constraint_name,
        constraint_definition.contype AS contype,
        pg_get_constraintdef(constraint_definition.oid) AS definition
      FROM pg_constraint constraint_definition
      JOIN pg_class child_table ON child_table.oid = constraint_definition.conrelid
      JOIN pg_namespace namespace ON namespace.oid = child_table.relnamespace
      JOIN pg_inherits inheritance ON inheritance.inhrelid = child_table.oid
      WHERE namespace.nspname = 'public'
        AND constraint_definition.contype = 'c'
        AND constraint_definition.conparentid = 0
      ORDER BY table_name, constraint_name`,
  )
  return rows
}

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
