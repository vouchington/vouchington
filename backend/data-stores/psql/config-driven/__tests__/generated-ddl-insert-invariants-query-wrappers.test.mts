import { beforeAll, describe, expect, it } from 'vitest'
import { initSqlAst } from 'vouchington-tooling/sql-ast'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { findFirstUnguardedInsertViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'

describe('config-driven generated DDL insert invariant: PREPARE/EXPLAIN wrappers', () => {
  beforeAll(() => Promise.all([loadSqlParserModule(), initSqlAst()]))

  it('flags a non-convergent INSERT inside a PREPARE ... AS statement', () => {
    // A PREPARE's INSERT is scanned unconditionally (fail closed): whether it ever runs
    // depends on a separate EXECUTE statement this per-statement guard can't see.
    expect(
      findFirstUnguardedInsertViolation(
        'PREPARE seed_foo AS INSERT INTO foo (id, attempts) VALUES (1, 1) ' +
          'ON CONFLICT (id) DO UPDATE SET attempts = foo.attempts + 1;',
      ),
    ).not.toBeNull()
  })

  it('flags a PREPARE ... AS statement whose ON CONFLICT DO UPDATE assigns an unresolved bind parameter', () => {
    // $1's bound value can differ on every EXECUTE of this prepared statement, so it can
    // never be proven convergent even without a self-reference to the assigned column.
    expect(
      findFirstUnguardedInsertViolation(
        'PREPARE seed_foo AS INSERT INTO foo (id, attempts) VALUES (1, 1) ' +
          'ON CONFLICT (id) DO UPDATE SET attempts = $1;',
      ),
    ).not.toBeNull()
  })

  it('does not flag an unguarded INSERT inside a plain EXPLAIN statement', () => {
    // Planning a statement without ANALYZE never executes it.
    expect(
      findFirstUnguardedInsertViolation("EXPLAIN INSERT INTO foo (slug) VALUES ('bar');"),
    ).toBeNull()
  })

  it('flags an unguarded INSERT inside an EXPLAIN ANALYZE statement', () => {
    // EXPLAIN ANALYZE does execute the statement it plans.
    expect(
      findFirstUnguardedInsertViolation("EXPLAIN ANALYZE INSERT INTO foo (slug) VALUES ('bar');"),
    ).not.toBeNull()
  })

  it('flags a non-convergent INSERT inside an EXPLAIN (ANALYZE) statement', () => {
    expect(
      findFirstUnguardedInsertViolation(
        'EXPLAIN (ANALYZE) INSERT INTO foo (id, attempts) VALUES (1, 1) ' +
          'ON CONFLICT (id) DO UPDATE SET attempts = foo.attempts + 1;',
      ),
    ).not.toBeNull()
  })
})
