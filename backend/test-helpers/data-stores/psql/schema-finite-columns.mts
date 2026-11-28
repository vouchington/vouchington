import { read } from '@data-stores/psql'
import { EXISTING_FINITE_VALUES } from '../../existing-finite-values.mts'
import { GENERATED_FINITE_VALUES } from '../../../data-stores/psql/finite-values/index.mts'
import { FINITE_COLUMN_CONTRACTS_1 } from './schema-finite-columns-1.mts'
import { FINITE_COLUMN_CONTRACTS_2 } from './schema-finite-columns-2.mts'
import { FINITE_COLUMN_CONTRACTS_3 } from './schema-finite-columns-3.mts'
import { FINITE_COLUMN_CONTRACTS_4 } from './schema-finite-columns-4.mts'
import { FINITE_COLUMN_CONTRACTS_5 } from './schema-finite-columns-5.mts'
import { FINITE_COLUMN_CONTRACTS_6 } from './schema-finite-columns-6.mts'
import { FINITE_COLUMN_CONTRACTS_7 } from './schema-finite-columns-7.mts'

const FINITE_VALUES = {
  ...GENERATED_FINITE_VALUES,
  ...EXISTING_FINITE_VALUES,
}

export const CONVERTED_FINITE_COLUMNS = [
  ...FINITE_COLUMN_CONTRACTS_1,
  ...FINITE_COLUMN_CONTRACTS_2,
  ...FINITE_COLUMN_CONTRACTS_3,
  ...FINITE_COLUMN_CONTRACTS_4,
  ...FINITE_COLUMN_CONTRACTS_5,
  ...FINITE_COLUMN_CONTRACTS_6,
  ...FINITE_COLUMN_CONTRACTS_7,
].map(([table, column, type, isArray]) => ({
  table,
  column,
  type,
  isArray,
  labels: FINITE_VALUES[type],
}))

export async function getFiniteEnumColumnTypes(
  columnKeys: string[],
): Promise<{ column_key: string; type_name: string }[]> {
  const { rows } = await read<{ column_key: string; type_name: string }>(
    `/* getFiniteEnumColumnTypes */
      SELECT
        table_name || '.' || column_name AS column_key,
        udt_name AS type_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name || '.' || column_name = ANY($1)
      ORDER BY column_key`,
    [columnKeys],
  )
  return rows
}

export async function getFiniteEnumLabels(
  typeNames: string[],
): Promise<{ type_name: string; labels: string[] }[]> {
  const { rows } = await read<{ type_name: string; labels: string[] }>(
    `/* getFiniteEnumLabels */
      SELECT
        type_definition.typname AS type_name,
        jsonb_agg(enum_definition.enumlabel ORDER BY enum_definition.enumsortorder) AS labels
      FROM pg_type type_definition
      JOIN pg_namespace namespace
        ON namespace.oid = type_definition.typnamespace
      JOIN pg_enum enum_definition
        ON enum_definition.enumtypid = type_definition.oid
      WHERE namespace.nspname = 'public'
        AND type_definition.typname = ANY($1)
      GROUP BY type_definition.typname
      ORDER BY type_definition.typname`,
    [typeNames],
  )
  return rows
}
