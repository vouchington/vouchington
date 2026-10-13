import { beforeAll, describe, expect, it } from 'vitest'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { loadExecutableSqlStrings } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-execute-helpers.mts'
import { findFirstGeneratedDdlViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-guard-helpers.mts'

describe('config-driven generated EXECUTE DDL guard regressions', () => {
  beforeAll(() => loadSqlParserModule())
  it('does not attribute another EXECUTE occurrence inside a quoted payload', async () => {
    const select = await loadExecutableSqlStrings(
      "DO $$BEGIN EXECUTE 'SELECT ''EXECUTE q'''; EXECUTE q; END$$;",
    )
    expect(select("BEGIN EXECUTE 'SELECT ''EXECUTE q'''")).toEqual(["SELECT 'EXECUTE q'"])
    expect(select('EXECUTE q')).toBeNull()
  })
  it('checks literal EXECUTE payloads without trusting unrelated SQL text', async () => {
    expect(
      await findFirstGeneratedDdlViolation(
        "DO $$ BEGIN EXECUTE 'CREATE TABLE dynamic_vote_edges (id uuid)'; END $$;",
      ),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
    expect(
      await findFirstGeneratedDdlViolation(
        "DO $$ BEGIN EXECUTE 'CREATE TABLE ''quoted_vote_edges'' (id uuid)'; END $$;",
      ),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
    expect(
      await findFirstGeneratedDdlViolation(
        'DO $body$ BEGIN EXECUTE $$CREATE TABLE dollar_vote_edges (id uuid)$$; END $body$;',
      ),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
    expect(
      await findFirstGeneratedDdlViolation(
        "DO $$ BEGIN EXECUTE 'CREATE ' || 'TABLE concat_vote_edges (id uuid)'; END $$;",
      ),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
    expect(
      await findFirstGeneratedDdlViolation(
        "DO $$ BEGIN EXECUTE '/* IF NOT EXISTS */ ALTER TABLE vote_edges ADD CONSTRAINT chk_score CHECK (score >= 0)'; END $$;",
      ),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
    expect(
      await findFirstGeneratedDdlViolation(
        "DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_docs_body ON docs USING gin (body)'; END $$;",
      ),
    ).toBeNull()
    expect(
      await findFirstGeneratedDdlViolation(
        "DO $$ DECLARE ddl text := 'CREATE TABLE hidden (id uuid)'; BEGIN EXECUTE ddl; END $$;",
      ),
    ).toBe('EXECUTE statements must use literal SQL payloads')
    expect(
      await findFirstGeneratedDdlViolation(
        "DO $$ DECLARE ddl text := 'CREATE TABLE hidden (id uuid)'; BEGIN EXECUTE ddl USING 'x'; END $$;",
      ),
    ).toBe('EXECUTE statements must use literal SQL payloads')
    expect(
      await findFirstGeneratedDdlViolation(
        "DO $$ DECLARE ddl text := 'CREATE'; BEGIN EXECUTE ddl || ' TABLE hidden (id uuid)'; END $$;",
      ),
    ).toBe('EXECUTE statements must use literal SQL payloads')
  })

  it('decodes source occurrences inside single-quoted DO bodies and ignores unrelated unsupported statements', async () => {
    expect(
      await findFirstGeneratedDdlViolation(
        "DO 'BEGIN EXECUTE ''CREATE TABLE encoded_edges (id uuid)''; END';",
      ),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
    expect(
      await findFirstGeneratedDdlViolation(
        "DO $$ BEGIN RAISE NOTICE 'starting'; EXECUTE 'CREATE TABLE noticed_edges (id uuid)'; END $$;",
      ),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
  })

  it('checks concatenated literal commands with USING and rejects a dynamic command', async () => {
    expect(
      await findFirstGeneratedDdlViolation(
        "DO $$ BEGIN EXECUTE 'CREATE ' || 'TABLE with_using (id uuid)' USING 1; END $$;",
      ),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
    expect(
      await findFirstGeneratedDdlViolation(
        "DO $$ DECLARE ddl text := 'CREATE TABLE hidden (id uuid)'; BEGIN EXECUTE ddl USING 1; END $$;",
      ),
    ).toBe('EXECUTE statements must use literal SQL payloads')
  })
})
