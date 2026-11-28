import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import { PARTITION_POLICIES, UNBOUNDED_UNPARTITIONED_TABLES } from '../schema-growth-registry.mts'
import { getSchemaGrowthRegistryCatalog } from '../../../test-helpers/data-stores/psql/schema-growth-registry-catalog.mts'
import { STATIC_IDENTITY_EXCEPTIONS } from '../../../test-helpers/schema-growth-bounded-policies.mts'
import {
  buildSchemaGrowthRegistry,
  NON_DEFAULT_ID_EXCEPTIONS,
  type SchemaIdPolicy,
} from '../../../test-helpers/schema-growth-test-policies.mts'

describe('PostgreSQL schema growth registry', () => {
  afterAll(async () => {
    await onGracefulShutdown('SIGTERM')
  })

  it('classifies every logical table and matches its partition strategy', async () => {
    const rows = await getSchemaGrowthRegistryCatalog()

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
    expect(rows.filter(({ partition_strategy }) => partition_strategy === 'l')).toEqual([])
    for (const row of rows) {
      const policy = PARTITION_POLICIES.get(row.table_name)
      if (!policy) continue
      expect(row.partition_strategy).toBe('r')
      expect(row.partition_key).toBe(`RANGE (${policy.key})`)
    }
  })
})
