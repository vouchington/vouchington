import { beforeAll, describe, expect, it } from 'vitest'
import { initSqlAst } from 'vouchington-tooling/sql-ast'
import { parsePostgresSql, type PostgresSqlTrigger } from 'no-mistakes'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { replayUnsafeTrigger } from '../../../../test-helpers/data-stores/psql/config-driven/on-conflict-triggers.mts'
import { findFirstUnguardedInsertViolation } from '../../../../test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'
import {
  generatedDependenciesForTable,
  hasGeneratedArbiterViolation,
  hasReplayUnsafeTrigger,
  triggerFactsForTable,
} from '../../../../test-helpers/data-stores/psql/config-driven/schema-snapshot-facts.mts'

async function parseTrigger(sql: string): Promise<PostgresSqlTrigger> {
  const parsed = await parsePostgresSql({ sql })
  expect(parsed.diagnostics).toEqual([])
  expect(parsed.statements).toHaveLength(1)
  const statement = parsed.statements[0]
  if (statement?.kind !== 'createTrigger') throw new Error('Expected a CREATE TRIGGER statement')
  return statement.trigger
}

describe('schema-snapshot-facts (backend real schema.json singleton)', () => {
  it('returns parsed trigger facts for a known table', async () => {
    const triggers = triggerFactsForTable('topic_aliases')
    expect(triggers).toBeDefined()
    expect(triggers?.length).toBeGreaterThanOrEqual(2)
    expect(triggers?.every(trigger => trigger?.eventFacts.length)).toBe(true)
  })

  it('returns an empty array for a known table with no triggers', async () => {
    expect(triggerFactsForTable('currencies')).toEqual([])
  })

  it('fails closed (undefined) for a table absent from the schema snapshot', async () => {
    expect(triggerFactsForTable('table_that_does_not_exist_xyz')).toBeUndefined()
  })
})

describe('generated-ddl-insert-invariants + real schema.json trigger data', () => {
  beforeAll(() => Promise.all([loadSqlParserModule(), initSqlAst()]))

  it('flags a replay-unsafe topic_aliases DO UPDATE exactly like the real, pre-fix seed bug', async () => {
    expect(
      await findFirstUnguardedInsertViolation(
        "INSERT INTO topic_aliases (topic_id, alias) SELECT 1, 'bot' " +
          'ON CONFLICT (alias) DO UPDATE SET topic_id = EXCLUDED.topic_id ' +
          'WHERE topic_aliases.topic_id IS NULL OR topic_aliases.topic_id = EXCLUDED.topic_id;',
      ),
    ).not.toBeNull()
  })

  it('accepts the fixed topic_aliases WHERE clause actually shipped in the seed generators', async () => {
    expect(
      await findFirstUnguardedInsertViolation(
        "INSERT INTO topic_aliases (topic_id, alias) SELECT 1, 'bot' " +
          'ON CONFLICT (alias) DO UPDATE SET topic_id = EXCLUDED.topic_id ' +
          'WHERE topic_aliases.topic_id IS NULL AND EXCLUDED.topic_id IS NOT NULL;',
      ),
    ).toBeNull()
  })

  it('still accepts the moderation-lock trigger in isolation', async () => {
    const moderationLockTriggers = triggerFactsForTable('agents')?.filter(
      trigger =>
        trigger?.function?.parts.at(-1)?.value === 'fn_lock_agent_moderation_transparency_agent',
    )
    expect(moderationLockTriggers).toHaveLength(1)
    expect(
      replayUnsafeTrigger(
        moderationLockTriggers!,
        new Set(['deleted_at', 'activated_at']),
        new Set(),
        undefined,
      ),
    ).toBe(false)
  })

  it('rejects an agent replay despite moderation-lock allowance when account validation runs before insert', async () => {
    expect(
      await findFirstUnguardedInsertViolation(
        'INSERT INTO agents (id, deleted_at, activated_at) VALUES (1, NULL, now()) ' +
          'ON CONFLICT (id) DO UPDATE SET ' +
          'deleted_at = NULL, ' +
          'activated_at = COALESCE(agents.activated_at, CURRENT_TIMESTAMP);',
      ),
    ).not.toBeNull()
  })

  it('accepts a guarded agent insert that avoids replaying before-insert account validation', async () => {
    expect(
      await findFirstUnguardedInsertViolation(
        'INSERT INTO agents (id, system_user_id, agent_type) ' +
          "SELECT 1, 2, 'moderator' WHERE NOT EXISTS (SELECT 1 FROM agents WHERE id = 1);",
      ),
    ).toBeNull()
  })

  it('fails closed for an insert into a table absent from the schema snapshot', async () => {
    expect(
      hasReplayUnsafeTrigger(
        { relation: { relname: 'table_that_does_not_exist_xyz' } },
        { targetList: [] },
      ),
    ).toBe(true)
  })

  it('flags an INSERT that assigns topic_aliases.alias, a source of the real search_vector column', async () => {
    expect(
      await findFirstUnguardedInsertViolation(
        "INSERT INTO topic_aliases (search_vector, alias) VALUES (to_tsvector('a'), 'a') " +
          'ON CONFLICT (search_vector) DO UPDATE SET alias = EXCLUDED.alias;',
      ),
    ).not.toBeNull()
  })

  it('accepts a bare self-reference to topic_aliases.alias against the same real arbiter', async () => {
    expect(
      await findFirstUnguardedInsertViolation(
        "INSERT INTO topic_aliases (search_vector, alias) VALUES (to_tsvector('a'), 'a') " +
          'ON CONFLICT (search_vector) DO UPDATE SET alias = alias;',
      ),
    ).toBeNull()
  })

  it('fails closed for a generated-arbiter check on a table absent from the schema snapshot', async () => {
    expect(
      hasGeneratedArbiterViolation(
        { relation: { relname: 'table_that_does_not_exist_xyz' } },
        { targetList: [] },
      ),
    ).toBe(true)
  })
})

describe('replayUnsafeTrigger from parsed SQL facts', () => {
  it('preserves quoted UPDATE OF identities and combined INSERT/UPDATE events', async () => {
    const after = await parseTrigger(
      'CREATE TRIGGER watched AFTER INSERT OR UPDATE OF "CaseSensitive", plain ON public.example ' +
        'FOR EACH ROW EXECUTE FUNCTION public.fn_audit()',
    )
    expect(replayUnsafeTrigger([after], new Set(['other']), new Set(), undefined)).toBe(false)
    expect(replayUnsafeTrigger([after], new Set(['casesensitive']), new Set(), undefined)).toBe(
      false,
    )
    expect(replayUnsafeTrigger([after], new Set(['CaseSensitive']), new Set(), undefined)).toBe(
      true,
    )
    expect(replayUnsafeTrigger([after], new Set(['plain']), new Set(), undefined)).toBe(true)

    const before = await parseTrigger(
      'CREATE TRIGGER watched BEFORE INSERT OR UPDATE OF "CaseSensitive" ON public.example ' +
        'FOR EACH ROW EXECUTE FUNCTION public.fn_audit()',
    )
    expect(replayUnsafeTrigger([before], new Set(['other']), new Set(), undefined)).toBe(true)
  })

  it('treats statement events as unconditional and allows known no-op functions', async () => {
    const statement = await parseTrigger(
      'CREATE TRIGGER watched AFTER UPDATE OF "CaseSensitive" ON public.example ' +
        'FOR EACH STATEMENT EXECUTE FUNCTION public.fn_audit()',
    )
    expect(replayUnsafeTrigger([statement], new Set(['other']), new Set(), undefined)).toBe(true)

    const harmless = await parseTrigger(
      'CREATE TRIGGER touched BEFORE UPDATE ON public.example ' +
        'FOR EACH ROW EXECUTE FUNCTION public.fn_update_updated_at()',
    )
    expect(replayUnsafeTrigger([harmless], new Set(['plain']), new Set(), undefined)).toBe(false)
  })

  it('fails closed when SQL does not yield a trigger fact', async () => {
    const malformed = await parsePostgresSql({ sql: 'CREATE TRIGGER broken BEFORE UPDATE ON' })
    expect(malformed.diagnostics.length).toBeGreaterThan(0)
    expect(replayUnsafeTrigger([undefined], new Set(['plain']), new Set(), undefined)).toBe(true)
  })
})

describe('generatedDependenciesForTable (backend real schema.json singleton)', () => {
  it('maps the real topic_aliases.search_vector STORED column to its alias source', async () => {
    const dependencies = generatedDependenciesForTable('topic_aliases')
    expect(dependencies?.get('search_vector')).toEqual(new Set(['alias']))
  })

  it('excludes the VIRTUAL created_at column', async () => {
    expect(generatedDependenciesForTable('topic_aliases')?.has('created_at')).toBe(false)
  })

  it('fails closed (undefined) for a table absent from the schema snapshot', async () => {
    expect(generatedDependenciesForTable('table_that_does_not_exist_xyz')).toBeUndefined()
  })
})
