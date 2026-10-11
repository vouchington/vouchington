import { describe, expect, it } from 'vitest'

import { findFirstUnguardedInsertViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'

describe('config-driven generated DDL insert invariant: NOT EXISTS scope in procedural statements', () => {
  it(
    'still flags an unguarded insert whose only NOT EXISTS is nested inside a VALUES scalar ' +
      'subquery, since that only guards the subquery and not the INSERT itself',
    async () => {
      // The scalar subquery guard restricts its own rows, not the outer INSERT.
      expect(
        await findFirstUnguardedInsertViolation(`DO $$
BEGIN
INSERT INTO foo (id) VALUES ((SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM bar)));
END
$$;`),
      ).toBe('INSERT INTO foo (id) VALUES ((SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM bar)))')
    },
  )

  it('does not flag a genuine top-level conjunctive WHERE NOT EXISTS guard in the same DO body', async () => {
    expect(
      await findFirstUnguardedInsertViolation(`DO $$
BEGIN
INSERT INTO foo (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM foo);
END
$$;`),
    ).toBeNull()
  })
})
