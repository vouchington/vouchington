import { beforeAll, describe, expect, it } from 'vitest'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { findFirstGeneratedDdlViolation } from '../../test-helpers/config-driven/generated-ddl-guard-helpers.mts'

describe('config-driven generated EXECUTE DDL guard regressions', () => {
  beforeAll(() => loadSqlParserModule())
  it('checks literal EXECUTE payloads without trusting unrelated SQL text', () => {
    expect(
      findFirstGeneratedDdlViolation(
        "DO $$ BEGIN EXECUTE 'CREATE TABLE dynamic_vote_edges (id uuid)'; END $$;",
      ),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
    expect(
      findFirstGeneratedDdlViolation(
        "DO $$ BEGIN EXECUTE 'CREATE TABLE ''quoted_vote_edges'' (id uuid)'; END $$;",
      ),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
    expect(
      findFirstGeneratedDdlViolation(
        'DO $body$ BEGIN EXECUTE $$CREATE TABLE dollar_vote_edges (id uuid)$$; END $body$;',
      ),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
    expect(
      findFirstGeneratedDdlViolation(
        "DO $$ BEGIN EXECUTE 'CREATE ' || 'TABLE concat_vote_edges (id uuid)'; END $$;",
      ),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
    expect(
      findFirstGeneratedDdlViolation(
        "DO $$ BEGIN EXECUTE '/* IF NOT EXISTS */ ALTER TABLE vote_edges ADD CONSTRAINT chk_score CHECK (score >= 0)'; END $$;",
      ),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
    expect(
      findFirstGeneratedDdlViolation(
        "DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_docs_body ON docs USING gin (body)'; END $$;",
      ),
    ).toBeNull()
    expect(
      findFirstGeneratedDdlViolation(
        "DO $$ DECLARE ddl text := 'CREATE TABLE hidden (id uuid)'; BEGIN EXECUTE ddl; END $$;",
      ),
    ).toBe('EXECUTE statements must use literal SQL payloads')
    expect(
      findFirstGeneratedDdlViolation(
        "DO $$ DECLARE ddl text := 'CREATE TABLE hidden (id uuid)'; BEGIN EXECUTE ddl USING 'x'; END $$;",
      ),
    ).toBe('EXECUTE statements must use literal SQL payloads')
    expect(
      findFirstGeneratedDdlViolation(
        "DO $$ DECLARE ddl text := 'CREATE'; BEGIN EXECUTE ddl || ' TABLE hidden (id uuid)'; END $$;",
      ),
    ).toBe('EXECUTE statements must use literal SQL payloads')
  })
})
