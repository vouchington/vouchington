import { beforeAll, describe, expect, it } from 'vitest'
import { initSqlAst } from 'vouchington-tooling/sql-ast'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { findFirstGeneratedDdlViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-guard-helpers.mts'

describe('config-driven generated DDL guard regressions', () => {
  beforeAll(() => Promise.all([loadSqlParserModule(), initSqlAst()]))
  it('rejects generated structural DDL without migration-owned guards', () => {
    expect(findFirstGeneratedDdlViolation('CREATE TABLE vote_edges (id UUID);')).toBe(
      'CREATE TABLE must use IF NOT EXISTS',
    )
    expect(
      findFirstGeneratedDdlViolation('CREATE INDEX idx_vote_edges__id ON vote_edges (id);'),
    ).toBe('CREATE INDEX must use IF NOT EXISTS')
    expect(
      findFirstGeneratedDdlViolation(
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vote_edges__id ON vote_edges (id);',
      ),
    ).toBe('config-driven generators must not emit CREATE INDEX CONCURRENTLY')
    expect(findFirstGeneratedDdlViolation('ALTER TABLE vote_edges ADD COLUMN score INT;')).toBe(
      'ALTER TABLE ADD COLUMN must use IF NOT EXISTS',
    )
    expect(findFirstGeneratedDdlViolation('DROP INDEX idx_vote_edges__id;')).toBe(
      'destructive DDL is not allowed',
    )
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  ALTER TABLE vote_edges ADD CONSTRAINT chk_vote_edges_score CHECK (score >= 0);
END $$;`),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
    expect(
      findFirstGeneratedDdlViolation(
        'ALTER TABLE vote_edges ADD COLUMN IF NOT EXISTS score INT, ADD CONSTRAINT chk_score CHECK (score >= 0);',
      ),
    ).toBe('ALTER TABLE outside a DO block must only use ADD COLUMN IF NOT EXISTS actions')
    expect(
      findFirstGeneratedDdlViolation(`DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_score') THEN
    ALTER TABLE vote_edges ADD CONSTRAINT chk_score CHECK (score >= 0);
  ELSE
    ALTER TABLE vote_edges ADD CONSTRAINT chk_else CHECK (score <= 1);
  END IF;
END $guard$;`),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
    expect(
      findFirstGeneratedDdlViolation(`DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_score') THEN
    ALTER TABLE vote_edges ADD CONSTRAINT chk_score CHECK (score >= 0);
  END IF;
  ALTER TABLE vote_edges ADD CONSTRAINT chk_other CHECK (score <= 1);
END $guard$;`),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
    expect(
      findFirstGeneratedDdlViolation(
        "INSERT INTO prompts (body) VALUES ('CREATE TABLE prompt text');",
      ),
    ).toBeNull()
    expect(findFirstGeneratedDdlViolation('CREATE VIEW v_vote_edges AS SELECT 1;')).toBe(
      'config-driven generators must not emit CREATE VIEW',
    )
    expect(findFirstGeneratedDdlViolation("CREATE TYPE vote_status AS ENUM ('up', 'down');")).toBe(
      'config-driven generators must not emit CREATE TYPE',
    )
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vote_status') THEN
    CREATE TYPE vote_status AS ENUM ('up', 'down');
  END IF;
END $$;`),
    ).toBeNull()
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM posts) THEN
    CREATE TABLE repeated_table (id uuid);
  END IF;
END $$;`),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
    expect(
      findFirstGeneratedDdlViolation('DO $$ BEGIN CREATE SEQUENCE moderation_seq; END $$;'),
    ).toBe('CREATE SEQUENCE must use IF NOT EXISTS')
    expect(
      findFirstGeneratedDdlViolation(
        'DO $$ BEGIN CREATE TRIGGER trg AFTER INSERT ON posts EXECUTE FUNCTION fn(); END $$;',
      ),
    ).toBe('CREATE TRIGGER must use a pre-check')
    expect(findFirstGeneratedDdlViolation('DROP TYPE vote_status;')).toBe(
      'destructive DDL is not allowed',
    )
    expect(findFirstGeneratedDdlViolation('DROP TABLE IF EXISTS moderation_reports;')).toBe(
      'destructive DDL is not allowed',
    )
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'old_idx') THEN
    DROP INDEX IF EXISTS old_idx;
  END IF;
END $$;`),
    ).toBeNull()
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  DROP INDEX IF EXISTS old_idx;
  ALTER TABLE vote_edges ADD CONSTRAINT chk_score CHECK (score >= 0);
END $$;`),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM moderation_reports) THEN
    TRUNCATE moderation_reports;
  END IF;
END $$;`),
    ).toBe('destructive DDL is not allowed')
    expect(findFirstGeneratedDdlViolation("ALTER TYPE vote_status ADD VALUE 'maybe';")).toBe(
      'config-driven generators must not emit non-table ALTER DDL',
    )
    expect(findFirstGeneratedDdlViolation('ALTER TABLE vote_edges RENAME COLUMN a TO b;')).toBe(
      'ALTER TABLE outside a DO block must be guarded',
    )
    expect(
      findFirstGeneratedDdlViolation(`DO LANGUAGE plpgsql $body$ BEGIN
  ALTER TABLE vote_edges ADD CONSTRAINT chk_score CHECK (score >= 0);
END $body$;`),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
    expect(
      findFirstGeneratedDdlViolation(`DO $body$ BEGIN
  -- IF NOT EXISTS appears only in this comment.
  ALTER TABLE vote_edges ADD CONSTRAINT chk_score CHECK (score >= 0);
END $body$;`),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
    expect(
      findFirstGeneratedDdlViolation(`DO $body$ BEGIN
  RAISE NOTICE 'IF NOT EXISTS (SELECT 1) THEN';
  ALTER TABLE vote_edges ADD CONSTRAINT chk_score CHECK (score >= 0);
END $body$;`),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
    expect(
      findFirstGeneratedDdlViolation(
        "DO 'BEGIN ALTER TABLE vote_edges ADD CONSTRAINT chk_score CHECK (true); END';",
      ),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
    expect(
      findFirstGeneratedDdlViolation(
        "DO $$ BEGIN ALTER TYPE vote_status ADD VALUE 'maybe'; END $$;",
      ),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_score') THEN
    IF true THEN
      PERFORM 1;
    END IF;
    ALTER TABLE vote_edges ADD CONSTRAINT chk_score CHECK (score >= 0);
  END IF;
END $$;`),
    ).toBeNull()
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  ALTER TABLE vote_edges ADD COLUMN IF NOT EXISTS score int, ADD CONSTRAINT chk_score CHECK (score >= 0);
END $$;`),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attname = 'old_score') THEN
    ALTER TABLE vote_edges DROP COLUMN old_score;
  END IF;
END $$;`),
    ).toBe('destructive DDL is not allowed')
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attname = 'old_score') THEN
    ALTER TABLE vote_edges DROP COLUMN old_score;
  END IF;
END $$;`),
    ).toBeNull()
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_score' AND NOT convalidated) THEN
    ALTER TABLE vote_edges VALIDATE CONSTRAINT chk_score;
  END IF;
END $$;`),
    ).toBeNull()
    expect(
      findFirstGeneratedDdlViolation(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_dynamic') THEN
    EXECUTE 'ALTER TABLE vote_edges ADD CONSTRAINT chk_dynamic CHECK (score >= 0)';
  END IF;
END $$;`),
    ).toBeNull()
    expect(
      findFirstGeneratedDdlViolation(
        "DO 'BEGIN\n' 'ALTER TABLE vote_edges ADD CONSTRAINT chk CHECK (true); END';",
      ),
    ).toBe('DO blocks with structural DDL must guard each action with a pre-check')
    expect(
      findFirstGeneratedDdlViolation(
        "INSERT INTO prompts (body) VALUES ('/*'); CREATE TABLE hidden (id uuid); INSERT INTO prompts (body) VALUES ('*/');",
      ),
    ).toBe('CREATE TABLE must use IF NOT EXISTS')
  })
})
