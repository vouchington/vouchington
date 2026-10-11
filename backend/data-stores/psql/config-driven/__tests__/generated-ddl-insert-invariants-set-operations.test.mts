import { describe, expect, it } from 'vitest'

import { findFirstUnguardedInsertViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'

describe('config-driven generated DDL insert invariant: UNION branches', () => {
  it('does not flag a UNION ALL INSERT whose every branch has its own conjunctive NOT EXISTS', async () => {
    expect(
      // libpg-query hangs a UNION's own branch predicates off larg/rarg, not the root
      // SelectStmt's whereClause — every row-producing branch carries its own conjunctive
      // NOT EXISTS, so the whole statement is guarded.
      await findFirstUnguardedInsertViolation(
        "INSERT INTO prompts (body) SELECT 'a' WHERE NOT EXISTS (SELECT 1 FROM prompts WHERE body = 'a') " +
          "UNION ALL SELECT 'b' WHERE NOT EXISTS (SELECT 1 FROM prompts WHERE body = 'b');",
      ),
    ).toBeNull()
  })

  it('flags a UNION ALL INSERT with one unguarded branch', async () => {
    expect(
      // Only one UNION branch is guarded, so the statement as a whole is not — a row can
      // still be inserted unconditionally on every boot via the unguarded branch.
      await findFirstUnguardedInsertViolation(
        "INSERT INTO prompts (body) SELECT 'a' WHERE NOT EXISTS (SELECT 1 FROM prompts WHERE body = 'a') " +
          "UNION ALL SELECT 'b';",
      ),
    ).toBe(
      "INSERT INTO prompts (body) SELECT 'a' WHERE NOT EXISTS (SELECT 1 FROM prompts WHERE body = 'a') " +
        "UNION ALL SELECT 'b'",
    )
  })
})
