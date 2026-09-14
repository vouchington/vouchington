import { beforeAll, describe, expect, it } from 'vitest'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { findFirstGeneratedDdlViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-guard-helpers.mts'

describe('config-driven generated DDL guard review regressions', () => {
  beforeAll(() => loadSqlParserModule())
  it('does not treat trigger EXECUTE FUNCTION syntax as dynamic SQL', () => {
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_posts') THEN
    CREATE TRIGGER trg_posts AFTER INSERT ON posts EXECUTE FUNCTION fn_posts();
  END IF;
END $$;`),
    ).toBeNull()
  })

  it('rejects unclassified CREATE DDL in generated DO blocks', () => {
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'archive') THEN
    CREATE SCHEMA archive;
  END IF;
END $$;`),
    ).toBe('config-driven generators must not emit unclassified CREATE DDL')
    expect(
      findFirstGeneratedDdlViolation(
        'CREATE OR REPLACE FUNCTION fn_posts() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;',
      ),
    ).toBeNull()
  })

  it('uses all prechecks opened by the current statement', () => {
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'posts') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_posts') THEN
      ALTER TABLE posts ADD CONSTRAINT chk_posts CHECK (id IS NOT NULL);
    END IF;
  END IF;
END $$;`),
    ).toBeNull()
  })

  it('extracts DO blocks that use quoted language identifiers', () => {
    expect(
      findFirstGeneratedDdlViolation(`DO LANGUAGE "plpgsql" $$ BEGIN
  ALTER TABLE posts ADD CONSTRAINT chk_posts CHECK (id IS NOT NULL);
END $$;`),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
  })

  it('forbids extension and function drops even when they use IF EXISTS', () => {
    expect(findFirstGeneratedDdlViolation('DROP EXTENSION IF EXISTS vector CASCADE;')).toBe(
      'destructive DDL is not allowed',
    )
    expect(findFirstGeneratedDdlViolation('DROP FUNCTION IF EXISTS fn_posts();')).toBe(
      'destructive DDL is not allowed',
    )
  })

  it('rejects top-level SELECT INTO table creation', () => {
    expect(findFirstGeneratedDdlViolation('SELECT * INTO hidden_posts FROM posts;')).toBe(
      'SELECT INTO table creation is not allowed',
    )
  })

  it('rejects transaction-unsafe concurrent index drops', () => {
    expect(findFirstGeneratedDdlViolation('DROP INDEX CONCURRENTLY IF EXISTS old_idx;')).toBe(
      'DROP INDEX CONCURRENTLY is not allowed',
    )
  })

  it('rejects compound absence prechecks for constructive DDL', () => {
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'new_posts')
    OR EXISTS (SELECT 1 FROM posts) THEN
    CREATE TABLE new_posts (id uuid);
  END IF;
END $$;`),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
  })

  it('rejects malformed absence prechecks for constructive DDL', () => {
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 THEN
    CREATE TABLE malformed_posts (id uuid);
  END IF;
END $$;`),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
  })

  it('preserves outer prechecks across nested ELSE arms', () => {
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_posts') THEN
    IF EXISTS (SELECT 1 FROM posts) THEN
      PERFORM 1;
    ELSE
      PERFORM 2;
    END IF;
    ALTER TABLE posts ADD CONSTRAINT chk_posts CHECK (id IS NOT NULL);
  END IF;
END $$;`),
    ).toBeNull()
  })
})
