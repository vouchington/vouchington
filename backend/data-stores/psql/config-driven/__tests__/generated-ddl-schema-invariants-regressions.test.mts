import { beforeAll, describe, expect, it } from 'vitest'
import { initSqlAst } from 'vouchington-tooling/sql-ast'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { findFirstUuidv7CreatedAtViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-schema-invariants.mts'

describe('config-driven generated DDL schema invariant regressions', () => {
  beforeAll(() => Promise.all([loadSqlParserModule(), initSqlAst()]))

  it('rejects a UUIDv7-keyed table whose created_at is not derived from id', () => {
    expect(
      findFirstUuidv7CreatedAtViolation(
        'CREATE TABLE vote_edges (id UUID PRIMARY KEY DEFAULT uuidv7(), created_at TIMESTAMPTZ DEFAULT now());',
      ),
    ).toBe(
      'vote_edges.created_at must be GENERATED ALWAYS AS (uuid_extract_timestamp(id)) ' +
        'because vote_edges.id is a UUIDv7 primary key',
    )
    expect(
      findFirstUuidv7CreatedAtViolation(
        'CREATE TABLE vote_edges (id UUID PRIMARY KEY DEFAULT uuidv7(), ' +
          'created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL);',
      ),
    ).toBeNull()
    expect(
      findFirstUuidv7CreatedAtViolation(
        'CREATE TABLE vote_edges (id UUID PRIMARY KEY DEFAULT uuidv7());',
      ),
    ).toBeNull()
    expect(
      // A composite primary key means id is not itself the primary key, so this is not
      // a "UUIDv7 table" by this check's own anti-circularity definition, even though
      // created_at is stored rather than generated.
      findFirstUuidv7CreatedAtViolation(
        'CREATE TABLE entity_relations (subject_id UUID, object_id UUID, ' +
          'id UUID DEFAULT uuidv7(), created_at TIMESTAMPTZ DEFAULT now(), ' +
          'PRIMARY KEY (subject_id, object_id));',
      ),
    ).toBeNull()
    expect(findFirstUuidv7CreatedAtViolation('not valid sql')).toBeNull()
    expect(
      // A CREATE TABLE nested inside a DO block body is opaque to the top-level parser
      // (the whole dollar-quoted body is one string token), so this violation is only
      // reachable by scanning DO block bodies as their own candidate statements.
      findFirstUuidv7CreatedAtViolation(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'vote_edges') THEN
    CREATE TABLE vote_edges (id UUID PRIMARY KEY DEFAULT uuidv7(), created_at TIMESTAMPTZ DEFAULT now());
  END IF;
END $$;`),
    ).toBe(
      'vote_edges.created_at must be GENERATED ALWAYS AS (uuid_extract_timestamp(id)) ' +
        'because vote_edges.id is a UUIDv7 primary key',
    )
    expect(
      findFirstUuidv7CreatedAtViolation(
        `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'vote_edges') THEN
    CREATE TABLE vote_edges (id UUID PRIMARY KEY DEFAULT uuidv7(), ` +
          `created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL);
  END IF;
END $$;`,
      ),
    ).toBeNull()
    expect(
      // A CREATE TABLE run via a dynamically EXECUTEd literal is opaque one level deeper
      // still: the DO block body scan sees only the EXECUTE statement, not the table DDL
      // inside its string argument.
      findFirstUuidv7CreatedAtViolation(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'vote_edges') THEN
    EXECUTE 'CREATE TABLE vote_edges (id UUID PRIMARY KEY DEFAULT uuidv7(), created_at TIMESTAMPTZ DEFAULT now())';
  END IF;
END $$;`),
    ).toBe(
      'vote_edges.created_at must be GENERATED ALWAYS AS (uuid_extract_timestamp(id)) ' +
        'because vote_edges.id is a UUIDv7 primary key',
    )
    expect(
      // A DO-block candidate statement carrying a PostgreSQL table modifier (UNLOGGED,
      // TEMP/TEMPORARY) must still be recognized as a CREATE TABLE, mirroring the same
      // modifier alternation `generated-ddl-guard-helpers.mts`'s top-level guard already uses.
      findFirstUuidv7CreatedAtViolation(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'vote_edges') THEN
    CREATE UNLOGGED TABLE vote_edges (id UUID PRIMARY KEY DEFAULT uuidv7(), created_at TIMESTAMPTZ DEFAULT now());
  END IF;
END $$;`),
    ).toBe(
      'vote_edges.created_at must be GENERATED ALWAYS AS (uuid_extract_timestamp(id)) ' +
        'because vote_edges.id is a UUIDv7 primary key',
    )
  })
})
