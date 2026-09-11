import { beforeAll, describe, expect, it } from 'vitest'
import { initSqlAst } from 'vouchington-tooling/sql-ast'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { findFirstUnguardedInsertViolation } from '../../test-helpers/config-driven/generated-ddl-insert-invariants.mts'

describe('config-driven generated DDL insert invariant: NOT EXISTS paren depth in the unparseable-fragment fallback', () => {
  beforeAll(() => Promise.all([loadSqlParserModule(), initSqlAst()]))

  it(
    'still flags an unguarded insert whose only NOT EXISTS is nested inside a VALUES scalar ' +
      'subquery, since that only guards the subquery and not the INSERT itself',
    () => {
      // splitSqlStatements has no PL/pgSQL grammar, so the leading BEGIN of a DO body glues
      // onto the INSERT and the combined text fails to parse standalone, reaching the masked
      // text fallback. `NOT EXISTS` there sits at paren depth 2 (inside VALUES ( (...) )), so
      // it must not be mistaken for a guard on the outer, unconditionally-executing INSERT.
      expect(
        findFirstUnguardedInsertViolation(`DO $$
BEGIN
INSERT INTO foo (id) VALUES ((SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM bar)));
END
$$;`),
      ).toBe('INSERT INTO foo (id) VALUES ((SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM bar)))')
    },
  )

  it(
    'does not flag a genuine top-level conjunctive WHERE NOT EXISTS guard in the same ' +
      'unparseable-fragment fallback',
    () => {
      expect(
        findFirstUnguardedInsertViolation(`DO $$
BEGIN
INSERT INTO foo (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM foo);
END
$$;`),
      ).toBeNull()
    },
  )
})
