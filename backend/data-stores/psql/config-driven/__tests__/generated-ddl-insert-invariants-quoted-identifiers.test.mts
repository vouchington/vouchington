import { describe, expect, it } from 'vitest'

import { findFirstUnguardedInsertViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'

describe('config-driven generated DDL insert invariant: double-quoted identifiers', () => {
  it('does not flag a double-quoted identifier whose text reads as the real conflict action', async () => {
    // A double-quoted identifier containing guard text (a column named "DO UPDATE") must not
    // be mistaken for the real conflict action — the real action here is DO NOTHING.
    expect(
      await findFirstUnguardedInsertViolation(`DO $$ BEGIN
  INSERT INTO foo (id, "DO UPDATE") VALUES (1, 2) ON CONFLICT (id) DO NOTHING;
END $$;`),
    ).toBeNull()
  })

  it('still flags a genuine accumulating DO UPDATE alongside an unrelated quoted identifier', async () => {
    // Quoted column names must not hide an accumulating conflict update.
    expect(
      await findFirstUnguardedInsertViolation(
        `DO $$ BEGIN
  INSERT INTO foo (id, "weird name", attempts) VALUES (1, 2, 1) ON CONFLICT (id) ` +
          `DO UPDATE SET attempts = foo.attempts + 1;
END $$;`,
      ),
    ).toContain(
      'INSERT INTO foo (id, "weird name", attempts) VALUES (1, 2, 1) ON CONFLICT (id) ' +
        'DO UPDATE SET attempts = foo.attempts + 1',
    )
  })

  it('still flags a top-level unguarded INSERT whose column text reads as a NOT EXISTS guard', async () => {
    // A quoted column is not a predicate: this insert has no replay guard.
    expect(
      await findFirstUnguardedInsertViolation(
        'INSERT INTO foo (id, "AND NOT EXISTS") VALUES (1, 2);',
      ),
    ).toBe('INSERT INTO foo (id, "AND NOT EXISTS") VALUES (1, 2)')
  })

  it('flags an unguarded sibling insert beside a guarded CTE with a quoted name', async () => {
    // CTE names and sibling predicates must not merge their replay contracts.
    expect(
      await findFirstUnguardedInsertViolation(`WITH "a" AS (
  INSERT INTO topics (created_via, slug) SELECT 'system', 'a' WHERE NOT EXISTS (SELECT 1)
), b AS (
  INSERT INTO topic_aliases (alias) VALUES ('a')
)
SELECT 1;`),
    ).toBe("INSERT INTO topic_aliases (alias) VALUES ('a')")
  })

  it('does not flag a double-quoted-CTE statement when every sibling guards its own insert', async () => {
    expect(
      await findFirstUnguardedInsertViolation(`WITH "a" AS (
  INSERT INTO topics (created_via, slug) SELECT 'system', 'a' WHERE NOT EXISTS (SELECT 1)
), b AS (
  INSERT INTO topic_aliases (alias) SELECT 'a' WHERE NOT EXISTS (SELECT 1)
)
SELECT 1;`),
    ).toBeNull()
  })
})
