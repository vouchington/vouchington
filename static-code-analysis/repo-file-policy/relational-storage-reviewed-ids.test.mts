import { describe, expect, it } from 'vitest'
import type { SchemaSnapshot, SchemaTableSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import {
  ALLOWED_AUDIT_SNAPSHOT_ID,
  ALLOWED_NONRELATION_UUID,
  ALLOWED_TOKEN_CURSOR_PROTOCOL_ID,
} from './relational-storage-catalog.mts'
import { checkRelationalStorage } from './relational-storage-guard.mts'
import { emptySchemaSnapshot, plainSnapshotTable } from './schema-snapshot-test-fixtures.mts'

function column(type: string) {
  return {
    type,
    nullable: true,
    defaultExpression: null,
    generatedExpression: null,
    identity: null,
    generated: null,
    collation: null,
    comment: null,
    ordinalPosition: 1,
  } as const
}

function foreignKey(columnName: string): SchemaTableSnapshot['foreignKeys'][string] {
  return {
    columns: [columnName],
    definition: `FOREIGN KEY (${columnName}) REFERENCES owners (id)`,
    referencedTable: 'owners',
    referencedColumns: ['id'],
    onUpdate: 'no action',
    onDelete: 'restrict',
    validated: true,
  }
}

function snapshot(tableName: string, columns: Record<string, ReturnType<typeof column>>) {
  const table = { ...plainSnapshotTable(), columns }
  return emptySchemaSnapshot({ [tableName]: table }) as SchemaSnapshot
}

const noFreshness = { enforceCatalogFreshness: false }

describe('reviewed token and audit snapshot identifiers', () => {
  it('accepts a reviewed token and a reviewed audit snapshot id without a foreign key', () => {
    expect(
      checkRelationalStorage(snapshot('post_votes', { device_id: column('uuid') }), noFreshness),
    ).toEqual([])
    expect(
      checkRelationalStorage(
        snapshot('oauth_authorization_server_events', { client_id: column('uuid') }),
        noFreshness,
      ),
    ).toEqual([])
  })

  it('reviews exact columns only, so the same names on a new table are still rejected', () => {
    const errors = checkRelationalStorage(
      snapshot('new_records', { device_id: column('uuid'), client_id: column('uuid') }),
      noFreshness,
    )
    expect(errors).toEqual([
      expect.stringContaining('new_records.device_id'),
      expect.stringContaining('new_records.client_id'),
    ])
  })

  it('accepts the reviewed encoded work key and keeps any other encoded key rejected', () => {
    expect(
      checkRelationalStorage(
        snapshot('user_deletion_external_works', { work_key: column('text') }),
        noFreshness,
      ),
    ).toEqual([])
    expect(
      checkRelationalStorage(snapshot('new_records', { work_key: column('text') }), noFreshness),
    ).toEqual([expect.stringContaining('new_records.work_key: encoded')])
  })

  it.each([
    ['post_votes', 'device_id', 'token, cursor or protocol identifier'],
    ['oauth_authorization_server_events', 'client_id', 'audit snapshot identifier'],
  ])('reports %s.%s as stale once the column gains a foreign key', (table, name, label) => {
    const value = snapshot(table, { [name]: column('uuid') })
    value.tables[table]!.foreignKeys[`${name}_fk`] = foreignKey(name)
    expect(checkRelationalStorage(value)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${table}.${name}: stale ${label} catalog entry; remove it`),
      ]),
    )
  })

  it('keeps the catalogs disjoint, with one reason per entry', () => {
    const tokens = [...ALLOWED_TOKEN_CURSOR_PROTOCOL_ID.keys()]
    const audits = [...ALLOWED_AUDIT_SNAPSHOT_ID.keys()]
    const entries = [...ALLOWED_TOKEN_CURSOR_PROTOCOL_ID, ...ALLOWED_AUDIT_SNAPSHOT_ID]
    const keys = [...tokens, ...audits]
    expect(keys.filter(key => !/^[a-z0-9_]+\.[a-z0-9_]+$/u.test(key))).toEqual([])
    expect(entries.filter(([, reason]) => reason.trim().length === 0).map(([key]) => key)).toEqual(
      [],
    )
    expect(keys.filter(key => ALLOWED_NONRELATION_UUID.has(key))).toEqual([])
    expect(tokens.filter(key => audits.includes(key))).toEqual([])
  })
})
