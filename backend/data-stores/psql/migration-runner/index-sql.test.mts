import { beforeAll, describe, expect, it } from 'vitest'
import { loadSqlParserModule } from './sql-statements.mts'
import { extractDroppedIndexNames } from './index-sql.mts'

describe('extractDroppedIndexNames', () => {
  beforeAll(() => loadSqlParserModule())

  it('returns [] for empty/whitespace-only SQL', () => {
    expect(extractDroppedIndexNames('')).toEqual([])
    expect(extractDroppedIndexNames('   ')).toEqual([])
  })

  it('extracts a bare DROP INDEX IF EXISTS target', () => {
    expect(extractDroppedIndexNames('DROP INDEX IF EXISTS idx_widgets__name;')).toEqual([
      'idx_widgets__name',
    ])
  })

  it('extracts the online-mode CONCURRENTLY form', () => {
    expect(
      extractDroppedIndexNames('DROP INDEX CONCURRENTLY IF EXISTS idx_widgets__name;'),
    ).toEqual(['idx_widgets__name'])
  })

  it('takes the last part of a schema-qualified name', () => {
    expect(extractDroppedIndexNames('DROP INDEX IF EXISTS public.idx_widgets__name;')).toEqual([
      'idx_widgets__name',
    ])
  })

  it('extracts every name from a multi-name drop', () => {
    expect(extractDroppedIndexNames('DROP INDEX idx_a, idx_b;')).toEqual(['idx_a', 'idx_b'])
  })

  it('extracts across multiple statements, ignoring non-index drops', () => {
    const sql = `
      DROP TABLE ignored;
      DROP INDEX IF EXISTS idx_a;
      CREATE INDEX idx_c ON widgets USING btree (name);
      DROP INDEX CONCURRENTLY IF EXISTS idx_b;
    `
    expect(extractDroppedIndexNames(sql)).toEqual(['idx_a', 'idx_b'])
  })

  it('throws on unparseable SQL rather than silently returning []', () => {
    expect(() => extractDroppedIndexNames('DROP INDEX (')).toThrow(/syntax error/)
  })
})
