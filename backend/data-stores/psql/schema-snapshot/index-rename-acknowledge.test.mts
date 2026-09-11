import { beforeAll, describe, expect, it } from 'vitest'
import { loadSqlParserModule } from '../migration-runner/sql-statements.mts'
import { collectDeclaredDrops, unacknowledgedRenames } from './index-rename-acknowledge.mts'
import type { RenamedIndex } from '@vouchington/postgres/pg-schema-snapshot'

function rename(retiredName: string, renamedTo = `${retiredName}_v2`): RenamedIndex {
  return {
    table: 'widgets',
    retiredName,
    retiredDefinition: `CREATE INDEX ${retiredName} ON public.widgets USING btree (name)`,
    renamedTo,
  }
}

describe('collectDeclaredDrops', () => {
  beforeAll(() => loadSqlParserModule())

  it('collects dropped index names across multiple migration files', async () => {
    const files: Record<string, string> = {
      'a.sql': 'DROP INDEX CONCURRENTLY IF EXISTS idx_a;',
      'b.sql': 'CREATE INDEX idx_c ON widgets USING btree (name);\nDROP INDEX IF EXISTS idx_b;',
    }
    const drops = await collectDeclaredDrops({
      migrationPaths: ['a.sql', 'b.sql'],
      readFile: path => Promise.resolve(files[path] ?? null),
    })
    expect(drops).toEqual(new Set(['idx_a', 'idx_b']))
  })

  it('skips migration paths whose readFile resolves to null', async () => {
    const drops = await collectDeclaredDrops({
      migrationPaths: ['missing.sql'],
      readFile: () => Promise.resolve(null),
    })
    expect(drops).toEqual(new Set())
  })
})

describe('unacknowledgedRenames', () => {
  it('filters out a rename whose retired name is a declared drop', () => {
    const { unacknowledged } = unacknowledgedRenames([rename('idx_a')], {
      declaredDrops: new Set(['idx_a']),
      allowlist: new Set(),
    })
    expect(unacknowledged).toEqual([])
  })

  it('matches a declared drop case-insensitively, per Postgres unquoted-identifier folding', () => {
    const { unacknowledged } = unacknowledgedRenames([rename('idx_a')], {
      declaredDrops: new Set(['IDX_A']),
      allowlist: new Set(),
    })
    expect(unacknowledged).toEqual([])
  })

  it('filters out a rename whose retired name is allowlisted', () => {
    const { unacknowledged, staleAllowlistEntries } = unacknowledgedRenames([rename('idx_a')], {
      declaredDrops: new Set(),
      allowlist: new Set(['idx_a']),
    })
    expect(unacknowledged).toEqual([])
    expect(staleAllowlistEntries).toEqual([])
  })

  it('matches an allowlist entry case-insensitively, reporting its original case if stale', () => {
    const { unacknowledged, staleAllowlistEntries } = unacknowledgedRenames([rename('idx_a')], {
      declaredDrops: new Set(),
      allowlist: new Set(['IDX_A']),
    })
    expect(unacknowledged).toEqual([])
    expect(staleAllowlistEntries).toEqual([])
  })

  it('reports a rename covered by neither a drop nor the allowlist', () => {
    const target = rename('idx_a')
    const { unacknowledged } = unacknowledgedRenames([target], {
      declaredDrops: new Set(),
      allowlist: new Set(),
    })
    expect(unacknowledged).toEqual([target])
  })

  it('reports an allowlist entry that matches no detected rename as stale, sorted', () => {
    const { unacknowledged, staleAllowlistEntries } = unacknowledgedRenames([], {
      declaredDrops: new Set(),
      allowlist: new Set(['idx_b', 'idx_a']),
    })
    expect(unacknowledged).toEqual([])
    expect(staleAllowlistEntries).toEqual(['idx_a', 'idx_b'])
  })

  it('does not report an allowlist entry that matched a rename as stale', () => {
    const { staleAllowlistEntries } = unacknowledgedRenames([rename('idx_a')], {
      declaredDrops: new Set(),
      allowlist: new Set(['idx_a']),
    })
    expect(staleAllowlistEntries).toEqual([])
  })
})
