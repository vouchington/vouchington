import { describe, expect, it } from 'vitest'

import { findFirstUnguardedInsertViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'

describe('config-driven generated DDL insert invariant: function bodies', () => {
  it('does not flag a non-convergent INSERT inside a SQL-standard BEGIN ATOMIC function body', async () => {
    // Defining a function does not execute its body, even when its statements
    // are represented as nested facts rather than an opaque string.
    expect(
      await findFirstUnguardedInsertViolation(
        'CREATE FUNCTION fn_audit() RETURNS void LANGUAGE SQL BEGIN ATOMIC ' +
          'INSERT INTO foo (id, attempts) VALUES (1, 1) ON CONFLICT (id) ' +
          'DO UPDATE SET attempts = foo.attempts + 1; END;',
      ),
    ).toBeNull()
  })
})
