import { beforeAll, describe, expect, it } from 'vitest'
import { initSqlAst } from 'vouchington-tooling/sql-ast'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { findFirstUnguardedInsertViolation } from '../../test-helpers/config-driven/generated-ddl-insert-invariants.mts'

describe('config-driven generated DDL insert invariant: double-quoted identifiers', () => {
  beforeAll(() => Promise.all([loadSqlParserModule(), initSqlAst()]))

  it('does not flag a double-quoted identifier whose text reads as the real conflict action', () => {
    // A double-quoted identifier containing guard text (a column named "DO UPDATE") must not
    // be mistaken for the real conflict action — the real action here is DO NOTHING.
    expect(
      findFirstUnguardedInsertViolation(`DO $$ BEGIN
  INSERT INTO foo (id, "DO UPDATE") VALUES (1, 2) ON CONFLICT (id) DO NOTHING;
END $$;`),
    ).toBeNull()
  })

  it('still flags a genuine accumulating DO UPDATE alongside an unrelated quoted identifier', () => {
    // The double-quote mask must not swallow a genuine accumulating DO UPDATE just because the
    // same segment also contains an unrelated double-quoted identifier.
    expect(
      findFirstUnguardedInsertViolation(
        `DO $$ BEGIN
  INSERT INTO foo (id, "weird name", attempts) VALUES (1, 2, 1) ON CONFLICT (id) ` +
          `DO UPDATE SET attempts = foo.attempts + 1;
END $$;`,
      ),
    ).toBe(
      'INSERT INTO foo (id, "weird name", attempts) VALUES (1, 2, 1) ON CONFLICT (id) ' +
        'DO UPDATE SET attempts = foo.attempts + 1',
    )
  })

  it('still flags a top-level unguarded INSERT whose column text reads as a NOT EXISTS guard', () => {
    // A parseable, top-level (non-DO-block) statement takes the same masked structural scan as
    // the DO-block cases above: a column literally named "AND NOT EXISTS" must not be mistaken
    // for a real conjunctive guard, since this INSERT has neither ON CONFLICT nor a real WHERE.
    expect(
      findFirstUnguardedInsertViolation('INSERT INTO foo (id, "AND NOT EXISTS") VALUES (1, 2);'),
    ).toBe('INSERT INTO foo (id, "AND NOT EXISTS") VALUES (1, 2)')
  })

  it(
    'flags a sibling CTE insert even when a double-quoted CTE name collapses ' +
      'splitCteSegmentRanges into one whole-statement range',
    () => {
      // "a" is double-quoted, so splitCteSegmentRanges' bare-identifier CTE_HEADER pattern
      // doesn't match it and the whole statement falls back to one merged range. That range's
      // masked text has a NOT EXISTS guard from CTE "a" but no ON CONFLICT text anywhere — the
      // exact shape that used to let a raw substring scan accept the whole range without ever
      // parsing or judging CTE b's own, entirely unguarded, insert.
      expect(
        findFirstUnguardedInsertViolation(`WITH "a" AS (
  INSERT INTO topics (slug) SELECT 'a' WHERE NOT EXISTS (SELECT 1)
), b AS (
  INSERT INTO topic_aliases (alias) VALUES ('a')
)
SELECT 1;`),
      ).toBe(
        "INSERT INTO topics (slug) SELECT 'a' WHERE NOT EXISTS (SELECT 1)\n" +
          '), b AS (\n' +
          "  INSERT INTO topic_aliases (alias) VALUES ('a')\n" +
          ')\n' +
          'SELECT 1',
      )
    },
  )

  it('does not flag a double-quoted-CTE statement when every sibling guards its own insert', () => {
    expect(
      findFirstUnguardedInsertViolation(`WITH "a" AS (
  INSERT INTO topics (slug) SELECT 'a' WHERE NOT EXISTS (SELECT 1)
), b AS (
  INSERT INTO topic_aliases (alias) SELECT 'a' WHERE NOT EXISTS (SELECT 1)
)
SELECT 1;`),
    ).toBeNull()
  })
})
