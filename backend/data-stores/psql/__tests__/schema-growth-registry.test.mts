import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown, read } from '../index.mts'
import {
  buildSchemaGrowthRegistry,
  NON_DEFAULT_ID_EXCEPTIONS,
  PARTITION_POLICIES,
  STATIC_IDENTITY_EXCEPTIONS,
  UNBOUNDED_UNPARTITIONED_TABLES,
  type SchemaIdPolicy,
} from '../schema-growth-registry.mts'

type CatalogTable = {
  table_name: string
  id_type: string | null
  id_default: string | null
  partition_strategy: 'l' | 'r' | null
  partition_key: string | null
}

describe('PostgreSQL schema growth registry', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('classifies every logical table and matches its partition strategy', async () => {
    const { rows } = await read<CatalogTable>(`/* getSchemaGrowthRegistryCatalog */
      SELECT
        tables.relname AS table_name,
        id_type.typname AS id_type,
        pg_get_expr(id_default.adbin, id_default.adrelid) AS id_default,
        partitioned.partstrat AS partition_strategy,
        pg_get_partkeydef(tables.oid) AS partition_key
      FROM pg_class tables
      JOIN pg_namespace namespace ON namespace.oid = tables.relnamespace
      LEFT JOIN pg_attribute id_column
        ON id_column.attrelid = tables.oid
       AND id_column.attname = 'id'
       AND NOT id_column.attisdropped
      LEFT JOIN pg_type id_type ON id_type.oid = id_column.atttypid
      LEFT JOIN pg_attrdef id_default
        ON id_default.adrelid = tables.oid
       AND id_default.adnum = id_column.attnum
      LEFT JOIN pg_partitioned_table partitioned ON partitioned.partrelid = tables.oid
      WHERE namespace.nspname = 'public'
        AND tables.relkind IN ('r', 'p')
        AND (
          tables.relkind = 'p'
          OR NOT EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid = tables.oid)
        )
      ORDER BY tables.relname`)

    const unknownIdPolicies: string[] = []
    const tables = new Map(
      rows.map(row => {
        let idPolicy: SchemaIdPolicy = 'no-id'
        let idPolicyRationale = 'The table is keyed by natural, provider, or composite columns.'
        if (STATIC_IDENTITY_EXCEPTIONS.has(row.table_name)) {
          idPolicy = 'static-identity'
          idPolicyRationale = STATIC_IDENTITY_EXCEPTIONS.get(row.table_name)!
        } else if (row.id_type === 'uuid' && row.id_default === 'uuidv7()') {
          idPolicy = 'uuidv7'
          idPolicyRationale = 'Internal row identity uses the repository UUIDv7 default.'
        } else if (NON_DEFAULT_ID_EXCEPTIONS.has(row.table_name)) {
          const exception = NON_DEFAULT_ID_EXCEPTIONS.get(row.table_name)!
          idPolicy = exception.policy
          idPolicyRationale = exception.rationale
        } else if (row.id_type !== null) {
          unknownIdPolicies.push(
            `${row.table_name}.id: type=${row.id_type}, default=${row.id_default ?? '<none>'}`,
          )
        }
        return [row.table_name, { idPolicy, idPolicyRationale }] as const
      }),
    )
    const registry = buildSchemaGrowthRegistry(tables)

    expect(unknownIdPolicies).toEqual([])
    expect(registry.map(({ table }) => table)).toEqual(rows.map(({ table_name }) => table_name))
    expect([...PARTITION_POLICIES.keys()].filter(table => !tables.has(table))).toEqual([])
    expect([...UNBOUNDED_UNPARTITIONED_TABLES.keys()].filter(table => !tables.has(table))).toEqual(
      [],
    )
    expect(
      rows
        .filter(
          ({ partition_strategy }) => partition_strategy === 'l' || partition_strategy === 'r',
        )
        .map(({ table_name }) => table_name),
    ).toEqual([...PARTITION_POLICIES.keys()].toSorted())
    expect(rows.filter(({ partition_strategy }) => partition_strategy === 'l')).toEqual([
      expect.objectContaining({ table_name: 'entity_relation_votes' }),
    ])
    expect(rows.filter(({ partition_strategy }) => partition_strategy === null)).not.toContainEqual(
      expect.objectContaining({ table_name: 'entity_relation_votes' }),
    )
    for (const row of rows) {
      const policy = PARTITION_POLICIES.get(row.table_name)
      if (!policy) continue
      expect(row.partition_strategy).toBe(policy.strategy === 'LIST -> RANGE' ? 'l' : 'r')
      expect(row.partition_key).toBe(
        policy.strategy === 'LIST -> RANGE' ? 'LIST (relation_table)' : `RANGE (${policy.key})`,
      )
    }
  })
})
