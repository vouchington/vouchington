import { beforeAll, describe, expect, it } from 'vitest'
import { initSqlAst } from 'vouchington-tooling/sql-ast'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { findFirstUnguardedInsertViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'

describe('config-driven generated DDL insert invariant: multiple inserts in one unparseable fragment', () => {
  beforeAll(() => Promise.all([loadSqlParserModule(), initSqlAst()]))

  it(
    'fails closed on a DO-body fragment carrying two inserts when a guard token on one ' +
      'could otherwise mask the other',
    () => {
      // splitSqlStatements has no PL/pgSQL grammar, so the leading BEGIN of a DO body glues
      // onto whatever comes before the first top-level semicolon — here, a whole two-CTE
      // WITH statement. That combined text fails to parse standalone, so this reaches the
      // masked text fallback with two INSERT INTO occurrences: foo's own DO NOTHING must not
      // be mistaken for a guard on bar's entirely unguarded insert.
      expect(
        findFirstUnguardedInsertViolation(`DO $$
BEGIN
WITH a AS (
  INSERT INTO foo (id) VALUES ('a') ON CONFLICT (id) DO NOTHING
), b AS (
  INSERT INTO bar (id) VALUES ('b')
)
SELECT 1;
END
$$;`),
      ).toBe(
        "INSERT INTO foo (id) VALUES ('a') ON CONFLICT (id) DO NOTHING\n" +
          '), b AS (\n' +
          "  INSERT INTO bar (id) VALUES ('b')\n" +
          ')\n' +
          'SELECT 1',
      )
    },
  )

  it('does not flag a DO-body fragment whose single glued-BEGIN chunk carries only one insert', () => {
    expect(
      findFirstUnguardedInsertViolation(`DO $$
BEGIN
INSERT INTO foo (id) VALUES ('a') ON CONFLICT (id) DO NOTHING;
END
$$;`),
    ).toBeNull()
  })
})
