import { describe, expect, it } from 'vitest'

import { findFirstUnguardedInsertViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'

describe('config-driven generated DDL insert invariant: sibling inserts', () => {
  it(
    'fails closed on a DO-body fragment carrying two inserts when a guard token on one ' +
      'could otherwise mask the other',
    async () => {
      // Each CTE has its own replay contract. A guard on foo must never
      // hide bar's unguarded insert inside the same DO body.
      expect(
        await findFirstUnguardedInsertViolation(`DO $$
BEGIN
WITH a AS (
  INSERT INTO foo (id) VALUES ('a') ON CONFLICT (id) DO NOTHING
), b AS (
  INSERT INTO bar (id) VALUES ('b')
)
SELECT 1;
END
$$;`),
      ).toBe("INSERT INTO bar (id) VALUES ('b')")
    },
  )

  it('does not flag a DO body containing one guarded insert', async () => {
    expect(
      await findFirstUnguardedInsertViolation(`DO $$
BEGIN
INSERT INTO foo (id) VALUES ('a') ON CONFLICT (id) DO NOTHING;
END
$$;`),
    ).toBeNull()
  })
})
