import { describe, expect, it } from 'vitest'

import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import { checkPostgresRuntimeSource } from './postgres-runtime-guard.mts'
import { findStaleSchemaAllowlistEntries } from './postgres-runtime-guard-runner.mts'

describe('PostgreSQL runtime source guardrails', () => {
  it('preserves annotation checks for interpolated local SQL bindings', () => {
    const annotated = `import { read } from '@data-stores/psql'; const query = sql\`/* getPost */ SELECT id FROM posts WHERE id = \${id}\`; await read(query)`
    const unannotated = `import { read } from '@data-stores/psql'; const query = sql\`SELECT id FROM posts WHERE id = \${id}\`; await read(query)`

    expect(
      checkPostgresRuntimeSource('backend/services/posts/get.mts', annotated, new Set()),
    ).toEqual([])
    expect(
      checkPostgresRuntimeSource('backend/services/posts/get.mts', unannotated, new Set()),
    ).toEqual([expect.stringContaining('query execution must start with a /* name */ annotation')])
    expect(
      checkPostgresRuntimeSource(
        'backend/services/posts/get.mts',
        `import { read } from '@data-stores/psql'; function find() { if (true) { var query = sql\`SELECT id FROM posts\` } return read(query) }`,
        new Set(),
      ),
    ).toEqual([expect.stringContaining('query execution must start with a /* name */ annotation')])
    expect(
      checkPostgresRuntimeSource(
        'backend/services/posts/get.mts',
        `import { read } from '@data-stores/psql'; function find() { var query = sql\`SELECT id FROM posts\`; return read(query) }`,
        new Set(),
      ),
    ).toEqual([expect.stringContaining('query execution must start with a /* name */ annotation')])
  })

  it('requires annotations on direct query execution but not SQL fragments', () => {
    expect(
      checkPostgresRuntimeSource(
        'backend/services/posts/get.mts',
        `import { read } from '@data-stores/psql'; const predicate = sql\`WHERE id = \${id}\`; await read(sql\` SELECT * FROM posts \${predicate}\`)`,
        new Set(),
      ),
    ).toEqual([expect.stringContaining('query execution must start with a /* name */ annotation')])
    expect(
      checkPostgresRuntimeSource(
        'backend/services/posts/get.mts',
        `import { read } from '@data-stores/psql'; const predicate = sql\`WHERE id = \${id}\`; await read(sql\`  /* getPost */ SELECT * FROM posts \${predicate}\`)`,
        new Set(),
      ),
    ).toEqual([])
  })

  it('requires annotations in test helpers used by development runtime scripts', () => {
    const source = `import { write } from '@data-stores/psql'; await write(sql\`INSERT INTO users DEFAULT VALUES\`)`

    expect(
      checkPostgresRuntimeSource(
        'backend/test-helpers/entities/users-direct.mts',
        source,
        new Set(),
      ),
    ).toEqual([expect.stringContaining('query execution must start with a /* name */ annotation')])
    expect(
      checkPostgresRuntimeSource(
        './backend/test-helpers/entities/users-direct.mts',
        source,
        new Set(),
      ),
    ).toEqual([expect.stringContaining('query execution must start with a /* name */ annotation')])
    expect(
      checkPostgresRuntimeSource('backend/test-helpers/entities/unrelated.mts', source, new Set()),
    ).toEqual([])
  })

  it('requires annotations on locally constructed query statements in their lexical scope', () => {
    expect(
      checkPostgresRuntimeSource(
        'backend/services/users/create.mts',
        `import { write } from '@data-stores/psql'; const query = sql\`INSERT INTO users DEFAULT VALUES\`; await write(query)`,
        new Set(),
      ),
    ).toEqual([expect.stringContaining('query execution must start with a /* name */ annotation')])
    expect(
      checkPostgresRuntimeSource(
        'backend/services/users/create.mts',
        `import { write } from '@data-stores/psql'; const query = sql\`/* createUser */ INSERT INTO users DEFAULT VALUES\`; await write(query)`,
        new Set(),
      ),
    ).toEqual([])
    expect(
      checkPostgresRuntimeSource(
        'backend/services/users/create.mts',
        `
          import { write } from '@data-stores/psql'
          function saveUser() {
            const query = sql\`INSERT INTO users DEFAULT VALUES\`
            return write(query)
          }
          function saveTopic() {
            const query = sql\`/* saveTopic */ INSERT INTO topics DEFAULT VALUES\`
            return write(query)
          }
        `,
        new Set(),
      ),
    ).toEqual([expect.stringContaining('query execution must start with a /* name */ annotation')])
    expect(
      checkPostgresRuntimeSource(
        'backend/services/users/create.mts',
        `
          import { write } from '@data-stores/psql'
          function saveUser() {
            return write(query)
          }
          const query = sql\`INSERT INTO users DEFAULT VALUES\`
        `,
        new Set(),
      ),
    ).toEqual([expect.stringContaining('query execution must start with a /* name */ annotation')])
  })

  it('rejects created_at predicates on UUIDv7 timestamp tables', () => {
    expect(
      checkPostgresRuntimeSource(
        'backend/services/posts/get.mts',
        `import { read } from '@data-stores/psql'; await read(sql\`/* recentPosts */ SELECT p.id FROM posts p WHERE p.created_at > \${cutoff}\`)`,
        new Set(['posts']),
      ),
    ).toEqual([expect.stringContaining('filter UUIDv7 tables by id instead of created_at')])
  })
})

describe('schema allowlist freshness', () => {
  it('reports allowlist entries whose table or column disappeared', () => {
    const allowlist = `new Map([['posts.owner_id', 'reason'], ['removed.id', 'reason']])`
    const schema = {
      tables: {
        posts: { columns: { id: {}, owner_id: {} } },
      },
    } as unknown as Pick<SchemaSnapshot, 'tables'>
    expect(findStaleSchemaAllowlistEntries(allowlist, schema)).toEqual(['removed.id'])
  })
})
