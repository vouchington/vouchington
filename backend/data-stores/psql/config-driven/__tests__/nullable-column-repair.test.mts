import { beforeAll, describe, expect, it } from 'vitest'

import { runConfigDrivenStatementsInTransaction } from '../../migration-runner/config-driven-statements.mts'
import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { findFirstGeneratedDdlViolation } from '../../test-helpers/config-driven/generated-ddl-guard-helpers.mts'
import { buildCatalogGuardedNullableColumnRepairSql } from '../utils/nullable-column-repair.mts'

const table = 'nullable_column_repair_test'
const column = 'activity_id'
const repairSql = buildCatalogGuardedNullableColumnRepairSql(table, column, 'UUID', 'uuidv7()')
const previouslyRequiredTable = 'previously_required_column_repair_test'
const previouslyRequiredRepairSql = buildCatalogGuardedNullableColumnRepairSql(
  previouslyRequiredTable,
  column,
  'UUID',
  'uuidv7()',
)
const noDefaultTable = 'nullable_column_no_default_repair_test'
const noDefaultRepairSql = buildCatalogGuardedNullableColumnRepairSql(
  noDefaultTable,
  'score',
  'SMALLINT',
  null,
)

describe('catalog-guarded nullable-column repair', () => {
  beforeAll(() => loadSqlParserModule())

  it('removes an obsolete default and then converges on no default', async () => {
    expect(noDefaultRepairSql).toContain('column_default.adbin IS NOT NULL')
    expect(noDefaultRepairSql).toContain('ALTER COLUMN score DROP DEFAULT')
    expect(noDefaultRepairSql).not.toContain('SET DEFAULT NULL')

    await runConfigDrivenStatementsInTransaction(
      `
CREATE TEMP TABLE ${noDefaultTable} (id UUID NOT NULL, score SMALLINT DEFAULT 0);
${noDefaultRepairSql}
${noDefaultRepairSql}
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute attribute
    JOIN pg_attrdef column_default
      ON column_default.adrelid = attribute.attrelid
     AND column_default.adnum = attribute.attnum
    WHERE attribute.attrelid = '${noDefaultTable}'::regclass
      AND attribute.attname = 'score'
  ) THEN
    RAISE EXCEPTION 'nullable score default was not removed';
  END IF;
END $$;`,
      undefined,
    )
  })

  it('guards every structural repair action', () => {
    expect(findFirstGeneratedDdlViolation(repairSql)).toBeNull()
    expect(repairSql).toContain(`ADD COLUMN ${column} UUID`)
    expect(repairSql).toContain(`ALTER COLUMN ${column} SET DEFAULT uuidv7()`)
    expect(repairSql).toContain(`ALTER COLUMN ${column} DROP NOT NULL`)
    expect(repairSql).not.toContain(`UPDATE ${table}`)
    expect(repairSql).not.toContain(`ALTER COLUMN ${column} SET NOT NULL`)
  })

  it('preserves legacy nulls, defaults future inserts, and is safe to rerun', async () => {
    // The invariant is asserted inside the SQL itself via RAISE EXCEPTION; a violation rejects
    // this promise, so resolves.not.toThrow() is the real JS-level assertion for that outcome.
    await expect(
      runConfigDrivenStatementsInTransaction(
        `
CREATE TEMP TABLE ${table} (id UUID NOT NULL);
INSERT INTO ${table} (id) VALUES (uuidv7());
${repairSql}
INSERT INTO ${table} (id) VALUES (uuidv7());
${repairSql}
DO $$ BEGIN
  IF (SELECT count(*) FROM ${table} WHERE ${column} IS NULL) <> 1 THEN
    RAISE EXCEPTION 'legacy null identity was not preserved';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute attribute
    JOIN pg_attrdef column_default
      ON column_default.adrelid = attribute.attrelid
     AND column_default.adnum = attribute.attnum
    WHERE attribute.attrelid = '${table}'::regclass
      AND attribute.attname = '${column}'
      AND NOT attribute.attnotnull
      AND pg_get_expr(column_default.adbin, column_default.adrelid) = 'uuidv7()'
  ) THEN
    RAISE EXCEPTION 'nullable column catalog repair failed';
  END IF;
END $$;`,
        undefined,
      ),
    ).resolves.not.toThrow()
  })

  it('removes a prior required-column constraint without rewriting rows', async () => {
    // The invariant is asserted inside the SQL itself via RAISE EXCEPTION; a violation rejects
    // this promise, so resolves.not.toThrow() is the real JS-level assertion for that outcome.
    await expect(
      runConfigDrivenStatementsInTransaction(
        `
CREATE TEMP TABLE ${previouslyRequiredTable} (
  id UUID NOT NULL,
  ${column} UUID NOT NULL DEFAULT uuidv7()
);
INSERT INTO ${previouslyRequiredTable} (id) VALUES (uuidv7());
${previouslyRequiredRepairSql}
INSERT INTO ${previouslyRequiredTable} (id, ${column}) VALUES (uuidv7(), NULL);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ${previouslyRequiredTable}
    WHERE ${column} IS NULL
  ) THEN
    RAISE EXCEPTION 'prior NOT NULL constraint was not removed';
  END IF;
END $$;`,
        undefined,
      ),
    ).resolves.not.toThrow()
  })
})
