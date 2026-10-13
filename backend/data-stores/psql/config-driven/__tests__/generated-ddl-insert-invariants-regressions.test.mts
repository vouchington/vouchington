import { describe, expect, it } from 'vitest'

import { findFirstUnguardedInsertViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'

describe('config-driven generated DDL insert invariant regressions', () => {
  it('rejects EXISTS guards made disjunctive by an enclosing NOT', async () => {
    expect(
      await findFirstUnguardedInsertViolation(
        "INSERT INTO prompts (body) SELECT 'hi' WHERE NOT (false AND EXISTS (SELECT 1));",
      ),
    ).not.toBeNull()
  })

  it('accepts NOT EXISTS made conjunctive by an enclosing NOT', async () => {
    expect(
      await findFirstUnguardedInsertViolation(
        "INSERT INTO prompts (body) SELECT 'hi' WHERE NOT (true OR EXISTS (SELECT 1));",
      ),
    ).toBeNull()
  })

  it('uses the effective EXISTS polarity through nested NOT expressions', async () => {
    const insert = "INSERT INTO prompts (body) SELECT 'hi' "
    const lookup = "SELECT 1 FROM prompts WHERE body = 'hi'"
    expect(
      await findFirstUnguardedInsertViolation(`${insert}WHERE NOT (NOT EXISTS (${lookup}));`),
    ).not.toBeNull()
    expect(
      await findFirstUnguardedInsertViolation(`${insert}WHERE NOT (NOT (NOT EXISTS (${lookup})));`),
    ).toBeNull()
  })

  it('rejects a config-driven INSERT with neither ON CONFLICT nor NOT EXISTS', async () => {
    expect(
      await findFirstUnguardedInsertViolation("INSERT INTO prompts (body) VALUES ('hi');"),
    ).toContain("INSERT INTO prompts (body) VALUES ('hi')")
    expect(
      await findFirstUnguardedInsertViolation(`DO $$ BEGIN
  INSERT INTO prompts (body) VALUES ('hi');
END $$;`),
    ).toContain("INSERT INTO prompts (body) VALUES ('hi')")
    expect(
      await findFirstUnguardedInsertViolation(
        "INSERT INTO prompts (body) VALUES ('hi') ON CONFLICT DO NOTHING;",
      ),
    ).toBeNull()
    expect(
      // A DO UPDATE whose SET target accumulates the self-reference is not
      // convergent: every worker boot re-applies the mutation instead of the
      // duplicate-key error the guard exists to catch.
      await findFirstUnguardedInsertViolation(
        'INSERT INTO foo (id, attempts) VALUES (1, 1) ON CONFLICT (id) ' +
          'DO UPDATE SET attempts = foo.attempts + 1;',
      ),
    ).toContain(
      'INSERT INTO foo (id, attempts) VALUES (1, 1) ON CONFLICT (id) ' +
        'DO UPDATE SET attempts = foo.attempts + 1',
    )
    expect(
      // A DO UPDATE whose self-reference is shielded by COALESCE/GREATEST re-applies
      // to the same steady state on every boot, so it is convergent.
      await findFirstUnguardedInsertViolation(
        'INSERT INTO currencies (id, activated_at, score) VALUES (1, now(), 1) ' +
          'ON CONFLICT (id) DO UPDATE SET ' +
          'activated_at = COALESCE(currencies.activated_at, CURRENT_TIMESTAMP), ' +
          'score = GREATEST(currencies.score, EXCLUDED.score);',
      ),
    ).toBeNull()
    expect(
      // A subscript index that itself self-references the existing row (here, the array's
      // own element 1) makes the write *location* differ across replays even though the
      // assigned value is a stable literal: [1,0] -> [2,0] -> [2,2] on repeated replay.
      await findFirstUnguardedInsertViolation(
        'INSERT INTO foo (id, values) VALUES (1, ARRAY[1, 0]) ON CONFLICT (id) ' +
          'DO UPDATE SET values[values[1]] = 2;',
      ),
    ).toContain(
      'INSERT INTO foo (id, values) VALUES (1, ARRAY[1, 0]) ON CONFLICT (id) ' +
        'DO UPDATE SET values[values[1]] = 2',
    )
    expect(
      // A subscript index that is a plain literal has no self-reference, so the same
      // subscripted-assignment shape is convergent once the index no longer reads the row.
      await findFirstUnguardedInsertViolation(
        'INSERT INTO currencies (id, values) VALUES (1, ARRAY[1, 0]) ON CONFLICT (id) ' +
          'DO UPDATE SET values[1] = 2;',
      ),
    ).toBeNull()
    expect(
      await findFirstUnguardedInsertViolation(
        "INSERT INTO prompts (id, body) SELECT uuidv7(), 'hi' " +
          "WHERE NOT EXISTS (SELECT 1 FROM prompts WHERE body = 'hi');",
      ),
    ).toBeNull()
    expect(
      // A claim row does not exempt a following unguarded insert in config-driven SQL.
      await findFirstUnguardedInsertViolation(`DO $$ BEGIN
  INSERT INTO migration_claims (migration_id) VALUES ('seed-x') ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO prompts (body) VALUES ('hi');
END $$;`),
    ).toContain("INSERT INTO prompts (body) VALUES ('hi')")
    expect(
      // A guard on one CTE's own INSERT must not mask an unguarded INSERT in a
      // sibling CTE of the same compound statement.
      await findFirstUnguardedInsertViolation(`WITH a AS (
  INSERT INTO topics (created_via, slug) VALUES ('system', 'a') ON CONFLICT DO NOTHING RETURNING id
), b AS (
  INSERT INTO topic_aliases (topic_id, alias) SELECT id, 'a' FROM a
)
SELECT id FROM a;`),
    ).toContain("INSERT INTO topic_aliases (topic_id, alias) SELECT id, 'a' FROM a")
    expect(
      // Both CTEs guard their own INSERT, so no violation.
      await findFirstUnguardedInsertViolation(`WITH a AS (
  INSERT INTO topics (created_via, slug) VALUES ('system', 'a') ON CONFLICT DO NOTHING RETURNING id
), b AS (
  INSERT INTO topic_aliases (topic_id, alias) SELECT id, 'a' FROM a WHERE NOT EXISTS (SELECT 1)
)
SELECT id FROM a;`),
    ).toBeNull()
    expect(
      // An INSERT run via a dynamically EXECUTEd literal is opaque one level deeper
      // still: the DO block body scan sees only the EXECUTE statement, not the INSERT
      // inside its string argument.
      await findFirstUnguardedInsertViolation(`DO $$ BEGIN
  EXECUTE 'INSERT INTO prompts (body) VALUES (''hi'')';
END $$;`),
    ).toContain("INSERT INTO prompts (body) VALUES ('hi')")
    expect(
      await findFirstUnguardedInsertViolation(`DO $$ BEGIN
  EXECUTE 'INSERT INTO prompts (body) VALUES (''hi'') ON CONFLICT DO NOTHING';
END $$;`),
    ).toBeNull()
    expect(
      // "NOT EXISTS" appearing as a computed boolean VALUE, not as a WHERE/AND-scoped
      // condition restricting the INSERT's source rows, must not be mistaken for a guard —
      // this INSERT still unconditionally inserts a row on every worker boot.
      await findFirstUnguardedInsertViolation(
        'INSERT INTO audit_rows (is_first) VALUES (NOT EXISTS (SELECT 1 FROM audit_rows));',
      ),
    ).toContain('INSERT INTO audit_rows (is_first) VALUES (NOT EXISTS (SELECT 1 FROM audit_rows))')
    expect(
      // An OR-joined NOT EXISTS is disjunctive, not a guard: this still inserts on every
      // boot where force_seed is true, regardless of whether the row already exists.
      await findFirstUnguardedInsertViolation(
        "INSERT INTO prompts (id, body) SELECT uuidv7(), 'hi' " +
          "WHERE force_seed OR NOT EXISTS (SELECT 1 FROM prompts WHERE body = 'hi');",
      ),
    ).toContain(
      "INSERT INTO prompts (id, body) SELECT uuidv7(), 'hi' " +
        "WHERE force_seed OR NOT EXISTS (SELECT 1 FROM prompts WHERE body = 'hi')",
    )
    expect(
      // A string containing "DO NOTHING" does not make an accumulating DO UPDATE safe.
      await findFirstUnguardedInsertViolation(
        `DO $$ BEGIN
  INSERT INTO foo (id, attempts, note) VALUES (1, 1, 'x') ON CONFLICT (id) ` +
          `DO UPDATE SET attempts = foo.attempts + 1, note = 'DO NOTHING';
END $$;`,
      ),
    ).toContain(
      "INSERT INTO foo (id, attempts, note) VALUES (1, 1, 'x') ON CONFLICT (id) " +
        "DO UPDATE SET attempts = foo.attempts + 1, note = 'DO NOTHING'",
    )
    expect(
      // Each quoted CTE guards its own insert: "seed" uses ON CONFLICT,
      // while "copy" uses a conjunctive NOT EXISTS in its source predicate.
      await findFirstUnguardedInsertViolation(
        `WITH "seed" AS (
  INSERT INTO topics (created_via, slug) VALUES ('system', 'a') ON CONFLICT DO NOTHING RETURNING id
), "copy" AS (
  INSERT INTO topic_aliases (topic_id, alias) SELECT id, 'a' FROM "seed" ` +
          `WHERE NOT EXISTS (SELECT 1 FROM topic_aliases WHERE topic_id = id)
)
SELECT id FROM "seed";`,
      ),
    ).toBeNull()
    expect(
      // The sibling CTE's DO NOTHING must not mask this CTE's accumulating update.
      await findFirstUnguardedInsertViolation(
        `DO $$ BEGIN
WITH "a" AS (
  INSERT INTO foo (id, attempts) VALUES (1, 1) ON CONFLICT (id) DO UPDATE SET attempts = foo.attempts + 1
), "b" AS (
  INSERT INTO bar (id) VALUES (1) ON CONFLICT (id) DO NOTHING
)
SELECT 1;
END $$;`,
      ),
    ).toContain(
      'INSERT INTO foo (id, attempts) VALUES (1, 1) ON CONFLICT (id) DO UPDATE SET attempts = foo.attempts + 1\n' +
        '), "b" AS (\n' +
        '  INSERT INTO bar (id) VALUES (1) ON CONFLICT (id) DO NOTHING\n' +
        ')\n' +
        'SELECT 1',
    )
  })
})
