import { beforeAll, describe, expect, it } from 'vitest'
import { initSqlAst } from 'vouchington-tooling/sql-ast'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { findFirstUnguardedInsertViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'
import {
  generatedDependenciesForTable,
  hasGeneratedArbiterViolation,
  hasReplayUnsafeTrigger,
  triggerTextsForTable,
} from '../../../../test-helpers/data-stores/psql/config-driven/schema-snapshot-facts.mts'

describe('schema-snapshot-facts (backend real schema.json singleton)', () => {
  it('returns the real trigger texts for a known table', () => {
    const triggers = triggerTextsForTable('topic_aliases')
    expect(triggers).toBeDefined()
    expect(triggers?.length).toBeGreaterThanOrEqual(2)
  })

  it('returns an empty array for a known table with no triggers', () => {
    expect(triggerTextsForTable('crawls')).toEqual([])
  })

  it('fails closed (undefined) for a table absent from the schema snapshot', () => {
    expect(triggerTextsForTable('table_that_does_not_exist_xyz')).toBeUndefined()
  })
})

describe('generated-ddl-insert-invariants + real schema.json trigger data', () => {
  beforeAll(() => Promise.all([loadSqlParserModule(), initSqlAst()]))

  it('flags a replay-unsafe topic_aliases DO UPDATE exactly like the real, pre-fix seed bug', () => {
    expect(
      findFirstUnguardedInsertViolation(
        "INSERT INTO topic_aliases (topic_id, alias) SELECT 1, 'bot' " +
          'ON CONFLICT (alias) DO UPDATE SET topic_id = EXCLUDED.topic_id ' +
          'WHERE topic_aliases.topic_id IS NULL OR topic_aliases.topic_id = EXCLUDED.topic_id;',
      ),
    ).not.toBeNull()
  })

  it('accepts the fixed topic_aliases WHERE clause actually shipped in the seed generators', () => {
    expect(
      findFirstUnguardedInsertViolation(
        "INSERT INTO topic_aliases (topic_id, alias) SELECT 1, 'bot' " +
          'ON CONFLICT (alias) DO UPDATE SET topic_id = EXCLUDED.topic_id ' +
          'WHERE topic_aliases.topic_id IS NULL AND EXCLUDED.topic_id IS NOT NULL;',
      ),
    ).toBeNull()
  })

  it('accepts agents.deleted_at = NULL only via the moderation-lock function allowlist', () => {
    expect(
      findFirstUnguardedInsertViolation(
        'INSERT INTO agents (id, deleted_at, activated_at) VALUES (1, NULL, now()) ' +
          'ON CONFLICT (id) DO UPDATE SET ' +
          'deleted_at = NULL, ' +
          'activated_at = COALESCE(agents.activated_at, CURRENT_TIMESTAMP);',
      ),
    ).toBeNull()
  })

  it('fails closed for an insert into a table absent from the schema snapshot', () => {
    expect(
      hasReplayUnsafeTrigger(
        { relation: { relname: 'table_that_does_not_exist_xyz' } },
        { targetList: [] },
      ),
    ).toBe(true)
  })

  it('flags an INSERT that assigns topic_aliases.alias, a source of the real search_vector column', () => {
    expect(
      findFirstUnguardedInsertViolation(
        "INSERT INTO topic_aliases (search_vector, alias) VALUES (to_tsvector('a'), 'a') " +
          'ON CONFLICT (search_vector) DO UPDATE SET alias = EXCLUDED.alias;',
      ),
    ).not.toBeNull()
  })

  it('accepts a bare self-reference to topic_aliases.alias against the same real arbiter', () => {
    expect(
      findFirstUnguardedInsertViolation(
        "INSERT INTO topic_aliases (search_vector, alias) VALUES (to_tsvector('a'), 'a') " +
          'ON CONFLICT (search_vector) DO UPDATE SET alias = alias;',
      ),
    ).toBeNull()
  })

  it('fails closed for a generated-arbiter check on a table absent from the schema snapshot', () => {
    expect(
      hasGeneratedArbiterViolation(
        { relation: { relname: 'table_that_does_not_exist_xyz' } },
        { targetList: [] },
      ),
    ).toBe(true)
  })
})

describe('generatedDependenciesForTable (backend real schema.json singleton)', () => {
  it('maps the real topic_aliases.search_vector STORED column to its alias source', () => {
    const dependencies = generatedDependenciesForTable('topic_aliases')
    expect(dependencies?.get('search_vector')).toEqual(new Set(['alias']))
  })

  it('excludes the VIRTUAL created_at column', () => {
    expect(generatedDependenciesForTable('topic_aliases')?.has('created_at')).toBe(false)
  })

  it('fails closed (undefined) for a table absent from the schema snapshot', () => {
    expect(generatedDependenciesForTable('table_that_does_not_exist_xyz')).toBeUndefined()
  })
})
