import { beforeAll, describe, expect, it } from 'vitest'
import { initSqlAst } from 'vouchington-tooling/sql-ast'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { findFirstUnguardedInsertViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'

describe('config-driven generated DDL insert invariant: function bodies', () => {
  beforeAll(() => Promise.all([loadSqlParserModule(), initSqlAst()]))

  it('does not flag a non-convergent INSERT inside a SQL-standard BEGIN ATOMIC function body', () => {
    // A SQL-standard function body (LANGUAGE SQL BEGIN ATOMIC ... END) parses into nested
    // statement nodes rather than an opaque string, reachable here as one top-level
    // statement since splitSqlStatements is real-parser-backed. Defining a function never
    // executes its body, so even a non-convergent DO UPDATE inside it must not be flagged.
    expect(
      findFirstUnguardedInsertViolation(
        'CREATE FUNCTION fn_audit() RETURNS void LANGUAGE SQL BEGIN ATOMIC ' +
          'INSERT INTO foo (id, attempts) VALUES (1, 1) ON CONFLICT (id) ' +
          'DO UPDATE SET attempts = foo.attempts + 1; END;',
      ),
    ).toBeNull()
  })
})
