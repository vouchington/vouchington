import { describe, expect, it } from 'vitest'

import { loadSchemaSnapshot, SCHEMA_SNAPSHOT_PATH } from './schema-snapshot-loader.mts'

const minimalSnapshot = {
  formatVersion: 2,
  tables: {},
  views: {},
  enums: {},
  extensions: {},
  functions: {},
  policies: {},
}

describe('schema snapshot loader', () => {
  it('accepts an injected v2 snapshot for isolated policy fixtures', () => {
    expect(loadSchemaSnapshot('/missing', new Set(), minimalSnapshot)).toEqual({
      errors: [],
      snapshot: minimalSnapshot,
    })
  })

  it('fails closed when the committed snapshot is missing or untracked', () => {
    const result = loadSchemaSnapshot('/missing', new Set())
    expect(result.snapshot).toBeNull()
    expect(result.errors).toEqual([expect.stringContaining(SCHEMA_SNAPSHOT_PATH)])
    expect(result.errors).toEqual([expect.stringContaining('must be tracked')])
  })

  it('fails closed for an unsupported version and incomplete table shape', () => {
    const result = loadSchemaSnapshot('/missing', new Set(), {
      ...minimalSnapshot,
      formatVersion: 1,
      tables: { posts: {} },
    })
    expect(result.snapshot).toBeNull()
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('formatVersion must be 2'),
        expect.stringContaining('tables.posts.columns must be an object'),
      ]),
    )
  })

  it.each([
    [
      'a malformed column, key, foreign key, index, and physical partition',
      {
        ...minimalSnapshot,
        tables: {
          posts: {
            relationKind: 'table',
            columns: { id: { type: 'uuid' } },
            primaryKey: { definition: 'PRIMARY KEY (id)', columns: [1] },
            uniqueConstraints: {},
            checkConstraints: {},
            foreignKeys: {
              posts_user_id_fkey: {
                definition: 'FOREIGN KEY (user_id) REFERENCES users(id)',
                columns: ['user_id'],
                referencedTable: 'users',
                referencedColumns: ['id'],
                onUpdate: 'explode',
                onDelete: 'cascade',
                validated: true,
              },
            },
            indexes: {
              posts_pkey: {
                definition: 'CREATE UNIQUE INDEX posts_pkey ON posts (id)',
                accessMethod: 'btree',
                unique: true,
                primary: true,
                constraintBacked: true,
                valid: true,
                ready: true,
                keys: [{ column: 'id', expression: 'id', opclass: 'uuid_ops', descending: false }],
                includedColumns: [],
                predicate: null,
              },
            },
            triggers: {},
            comment: null,
            physicalPartition: { strategy: 'unknown', key: 1 },
            partition: null,
            growth: 'unbounded',
          },
        },
      },
      [
        'tables.posts.columns.id.nullable',
        'tables.posts.primaryKey.columns[0]',
        'tables.posts.foreignKeys.posts_user_id_fkey.onUpdate',
        'tables.posts.indexes.posts_pkey.keys[0].nullsFirst',
        'tables.posts.physicalPartition.strategy',
      ],
    ],
    [
      'a malformed registry partition policy',
      {
        ...minimalSnapshot,
        tables: {
          posts: {
            relationKind: 'partitioned table',
            columns: {},
            primaryKey: null,
            uniqueConstraints: {},
            checkConstraints: {},
            foreignKeys: {},
            indexes: {},
            triggers: {},
            comment: null,
            physicalPartition: { strategy: 'range', key: 'id' },
            partition: {
              strategy: 'RANGE',
              key: 'id',
              children: 'monthly',
              retentionOwner: null,
              accessClass: 'wrong',
            },
            growth: 'unbounded',
          },
        },
      },
      ['tables.posts.partition.accessClass'],
    ],
    [
      'malformed top-level fact shapes',
      {
        ...minimalSnapshot,
        views: { active_posts: { definition: 'SELECT 1', comment: null, materialized: 'no' } },
        enums: { post_statuses: { values: ['published', 1] } },
        extensions: { pgcrypto: { version: 17 } },
        functions: { fn_posts: { definition: null } },
        policies: {
          posts_visible: {
            table: 'posts',
            command: 'SELECT',
            pgRoles: ['public'],
            using: false,
            withCheck: null,
          },
        },
      },
      [
        'views.active_posts.materialized',
        'enums.post_statuses.values[1]',
        'extensions.pgcrypto.version',
        'functions.fn_posts.definition',
        'policies.posts_visible.using',
      ],
    ],
  ])('fails closed for %s', (_description, snapshot, expectedPaths) => {
    const result = loadSchemaSnapshot('/missing', new Set(), snapshot)
    expect(result.snapshot).toBeNull()
    expect(result.errors).toEqual(
      expect.arrayContaining(
        expectedPaths.map(path => expect.stringContaining(`${SCHEMA_SNAPSHOT_PATH}: ${path}`)),
      ),
    )
    expect(result.errors).toEqual(
      expect.arrayContaining(
        expectedPaths.map(() => expect.stringContaining(`::error file=${SCHEMA_SNAPSHOT_PATH}::`)),
      ),
    )
  })
})
