import { beforeAll, describe, expect, it } from 'vitest'
import { initSqlAst } from 'vouchington-tooling/sql-ast'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { findFirstUnguardedInsertViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'

describe('config-driven generated DDL insert invariant regressions', () => {
  beforeAll(() => Promise.all([loadSqlParserModule(), initSqlAst()]))

  it('rejects a config-driven INSERT with neither ON CONFLICT nor NOT EXISTS', () => {
    expect(findFirstUnguardedInsertViolation("INSERT INTO prompts (body) VALUES ('hi');")).toBe(
      "INSERT INTO prompts (body) VALUES ('hi')",
    )
    expect(
      findFirstUnguardedInsertViolation(`DO $$ BEGIN
  INSERT INTO prompts (body) VALUES ('hi');
END $$;`),
    ).toBe("INSERT INTO prompts (body) VALUES ('hi')")
    expect(
      findFirstUnguardedInsertViolation(
        "INSERT INTO prompts (body) VALUES ('hi') ON CONFLICT DO NOTHING;",
      ),
    ).toBeNull()
    expect(
      // A DO UPDATE whose SET target accumulates the self-reference is not
      // convergent: every worker boot re-applies the mutation instead of the
      // duplicate-key error the guard exists to catch.
      findFirstUnguardedInsertViolation(
        'INSERT INTO foo (id, attempts) VALUES (1, 1) ON CONFLICT (id) ' +
          'DO UPDATE SET attempts = foo.attempts + 1;',
      ),
    ).toBe(
      'INSERT INTO foo (id, attempts) VALUES (1, 1) ON CONFLICT (id) ' +
        'DO UPDATE SET attempts = foo.attempts + 1',
    )
    expect(
      // A DO UPDATE whose self-reference is shielded by COALESCE/GREATEST re-applies
      // to the same steady state on every boot, so it is convergent.
      findFirstUnguardedInsertViolation(
        'INSERT INTO crawls (id, activated_at, score) VALUES (1, now(), 1) ' +
          'ON CONFLICT (id) DO UPDATE SET ' +
          'activated_at = COALESCE(crawls.activated_at, CURRENT_TIMESTAMP), ' +
          'score = GREATEST(crawls.score, EXCLUDED.score);',
      ),
    ).toBeNull()
    expect(
      // A subscript index that itself self-references the existing row (here, the array's
      // own element 1) makes the write *location* differ across replays even though the
      // assigned value is a stable literal: [1,0] -> [2,0] -> [2,2] on repeated replay.
      findFirstUnguardedInsertViolation(
        'INSERT INTO foo (id, values) VALUES (1, ARRAY[1, 0]) ON CONFLICT (id) ' +
          'DO UPDATE SET values[values[1]] = 2;',
      ),
    ).toBe(
      'INSERT INTO foo (id, values) VALUES (1, ARRAY[1, 0]) ON CONFLICT (id) ' +
        'DO UPDATE SET values[values[1]] = 2',
    )
    expect(
      // A subscript index that is a plain literal has no self-reference, so the same
      // subscripted-assignment shape is convergent once the index no longer reads the row.
      findFirstUnguardedInsertViolation(
        'INSERT INTO crawls (id, values) VALUES (1, ARRAY[1, 0]) ON CONFLICT (id) ' +
          'DO UPDATE SET values[1] = 2;',
      ),
    ).toBeNull()
    expect(
      findFirstUnguardedInsertViolation(
        "INSERT INTO prompts (id, body) SELECT uuidv7(), 'hi' " +
          "WHERE NOT EXISTS (SELECT 1 FROM prompts WHERE body = 'hi');",
      ),
    ).toBeNull()
    expect(
      // The claims-ledger idiom: a claim row is inserted with ON CONFLICT DO NOTHING and
      // the block returns early when the claim already existed, so every statement after
      // the guard converges after one successful run and needs no guard of its own.
      findFirstUnguardedInsertViolation(`DO $$ BEGIN
  INSERT INTO election_vote_migration_claims (migration_id) VALUES ('repair-x') ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO prompts (body) VALUES ('hi');
END $$;`),
    ).toBeNull()
    expect(
      // A claim key built from a computed expression (uuidv7()) produces a different
      // value on every retry, so ON CONFLICT never matches and the guard never actually
      // short-circuits — this must not be treated as a dominant claim guard.
      findFirstUnguardedInsertViolation(`DO $$ BEGIN
  INSERT INTO election_vote_migration_claims (migration_id) VALUES (uuidv7()) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO prompts (body) VALUES ('hi');
END $$;`),
    ).toBe("INSERT INTO prompts (body) VALUES ('hi')")
    expect(
      // The claim-guard exemption must not swallow an unguarded INSERT that runs
      // *before* the claim row is inserted — only what follows the guard converges
      // after one successful run.
      findFirstUnguardedInsertViolation(`DO $$ BEGIN
  INSERT INTO prompts (body) VALUES ('unrelated');
  INSERT INTO election_vote_migration_claims (migration_id) VALUES ('repair-x') ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO other_table (body) VALUES ('hi');
END $$;`),
    ).toBe("INSERT INTO prompts (body) VALUES ('unrelated')")
    expect(
      // A guard on one CTE's own INSERT must not mask an unguarded INSERT in a
      // sibling CTE of the same compound statement.
      findFirstUnguardedInsertViolation(`WITH a AS (
  INSERT INTO topics (slug) VALUES ('a') ON CONFLICT DO NOTHING RETURNING id
), b AS (
  INSERT INTO topic_aliases (topic_id, alias) SELECT id, 'a' FROM a
)
SELECT id FROM a;`),
    ).toBe("INSERT INTO topic_aliases (topic_id, alias) SELECT id, 'a' FROM a")
    expect(
      // Both CTEs guard their own INSERT, so no violation.
      findFirstUnguardedInsertViolation(`WITH a AS (
  INSERT INTO topics (slug) VALUES ('a') ON CONFLICT DO NOTHING RETURNING id
), b AS (
  INSERT INTO topic_aliases (topic_id, alias) SELECT id, 'a' FROM a WHERE NOT EXISTS (SELECT 1)
)
SELECT id FROM a;`),
    ).toBeNull()
    expect(
      // An INSERT run via a dynamically EXECUTEd literal is opaque one level deeper
      // still: the DO block body scan sees only the EXECUTE statement, not the INSERT
      // inside its string argument.
      findFirstUnguardedInsertViolation(`DO $$ BEGIN
  EXECUTE 'INSERT INTO prompts (body) VALUES (''hi'')';
END $$;`),
    ).toBe("INSERT INTO prompts (body) VALUES ('hi')")
    expect(
      findFirstUnguardedInsertViolation(`DO $$ BEGIN
  EXECUTE 'INSERT INTO prompts (body) VALUES (''hi'') ON CONFLICT DO NOTHING';
END $$;`),
    ).toBeNull()
    expect(
      // The claim-guard exemption must not fire when the guard itself is nested inside a
      // conditional branch that can be skipped — the final INSERT is not actually reachable
      // only after the guard converges, since `should_claim` can be false.
      findFirstUnguardedInsertViolation(`DO $$ BEGIN
  IF should_claim THEN
    INSERT INTO election_vote_migration_claims (migration_id) VALUES ('repair-x') ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN; END IF;
  END IF;
  INSERT INTO prompts (body) VALUES ('hi');
END $$;`),
    ).toBe("INSERT INTO prompts (body) VALUES ('hi')")
    expect(
      // A skippable loop is just as unreachable-guaranteeing as a skippable IF: a claim guard
      // nested inside a WHILE/FOR/LOOP whose body can run zero times must not be treated as
      // dominant either.
      findFirstUnguardedInsertViolation(`DO $$ BEGIN
  FOR i IN 1..0 LOOP
    INSERT INTO election_vote_migration_claims (migration_id) VALUES ('repair-x') ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN; END IF;
  END LOOP;
  INSERT INTO prompts (body) VALUES ('hi');
END $$;`),
    ).toBe("INSERT INTO prompts (body) VALUES ('hi')")
    expect(
      // "NOT EXISTS" appearing as a computed boolean VALUE, not as a WHERE/AND-scoped
      // condition restricting the INSERT's source rows, must not be mistaken for a guard —
      // this INSERT still unconditionally inserts a row on every worker boot.
      findFirstUnguardedInsertViolation(
        'INSERT INTO audit_rows (is_first) VALUES (NOT EXISTS (SELECT 1 FROM audit_rows));',
      ),
    ).toBe('INSERT INTO audit_rows (is_first) VALUES (NOT EXISTS (SELECT 1 FROM audit_rows))')
    expect(
      // An OR-joined NOT EXISTS is disjunctive, not a guard: this still inserts on every
      // boot where force_seed is true, regardless of whether the row already exists.
      findFirstUnguardedInsertViolation(
        "INSERT INTO prompts (id, body) SELECT uuidv7(), 'hi' " +
          "WHERE force_seed OR NOT EXISTS (SELECT 1 FROM prompts WHERE body = 'hi');",
      ),
    ).toBe(
      "INSERT INTO prompts (id, body) SELECT uuidv7(), 'hi' " +
        "WHERE force_seed OR NOT EXISTS (SELECT 1 FROM prompts WHERE body = 'hi')",
    )
    expect(
      // A DO-block fragment carrying an accumulating DO UPDATE that also stores a string
      // literal containing the guard text ("DO NOTHING") must not have that literal
      // text mistaken for the real conflict action once the fragment falls back to a
      // masked regex match (the leading BEGIN glued on by the fallback splitter makes
      // it fail to parse standalone).
      findFirstUnguardedInsertViolation(
        `DO $$ BEGIN
  INSERT INTO foo (id, attempts, note) VALUES (1, 1, 'x') ON CONFLICT (id) ` +
          `DO UPDATE SET attempts = foo.attempts + 1, note = 'DO NOTHING';
END $$;`,
      ),
    ).toBe(
      "INSERT INTO foo (id, attempts, note) VALUES (1, 1, 'x') ON CONFLICT (id) " +
        "DO UPDATE SET attempts = foo.attempts + 1, note = 'DO NOTHING'",
    )
    expect(
      // A quoted CTE name doesn't match splitCteSegmentRanges' bare-identifier header
      // pattern, so the whole multi-CTE statement collapses into one segment carrying
      // both CTEs' INSERTs. The "copy" INSERT has no onConflictClause at all — it's
      // guarded by its own source SELECT's conjunctive NOT EXISTS — so it must not be
      // wrongly rejected just because its sibling "seed" CTE uses ON CONFLICT.
      findFirstUnguardedInsertViolation(
        `WITH "seed" AS (
  INSERT INTO topics (slug) VALUES ('a') ON CONFLICT DO NOTHING RETURNING id
), "copy" AS (
  INSERT INTO topic_aliases (topic_id, alias) SELECT id, 'a' FROM "seed" ` +
          `WHERE NOT EXISTS (SELECT 1 FROM topic_aliases WHERE topic_id = id)
)
SELECT id FROM "seed";`,
      ),
    ).toBeNull()
    expect(
      // Same quoted-CTE single-segment collapse as above, but now inside a DO block: the
      // fallback splitter glues a leading BEGIN onto the WITH statement, so it fails to
      // parse standalone and falls to the masked regex scan. The "b" CTE's genuine DO
      // NOTHING must not mask the "a" CTE's accumulating DO UPDATE elsewhere in the same
      // unparseable segment — the fallback must fail closed on DO UPDATE regardless of
      // where DO NOTHING also appears in the segment.
      findFirstUnguardedInsertViolation(
        `DO $$ BEGIN
WITH "a" AS (
  INSERT INTO foo (id, attempts) VALUES (1, 1) ON CONFLICT (id) DO UPDATE SET attempts = foo.attempts + 1
), "b" AS (
  INSERT INTO bar (id) VALUES (1) ON CONFLICT (id) DO NOTHING
)
SELECT 1;
END $$;`,
      ),
    ).toBe(
      'INSERT INTO foo (id, attempts) VALUES (1, 1) ON CONFLICT (id) DO UPDATE SET attempts = foo.attempts + 1\n' +
        '), "b" AS (\n' +
        '  INSERT INTO bar (id) VALUES (1) ON CONFLICT (id) DO NOTHING\n' +
        ')\n' +
        'SELECT 1',
    )
  })
})
