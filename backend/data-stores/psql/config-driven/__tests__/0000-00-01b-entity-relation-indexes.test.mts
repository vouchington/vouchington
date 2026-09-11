import { beforeAll, describe, expect, it } from 'vitest'
import { extractIndexShapes } from '../../migration-runner/index-sql.mts'
import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import idempotent from '../0000-00-01b-entity-relation-indexes.mts'

// Groups by shapeKey (canonical body, name-independent) and reports every table whose
// shape maps to more than one index name — the diagnostic a renamed-but-equivalent index
// (previous name vs. current name) must fail against.
function findIndexShapeCollisions(
  shapes: readonly { idxname: string; table: string; shapeKey: string }[],
): string[] {
  const byShapeKey = new Map<string, { table: string; names: Set<string> }>()
  for (const { idxname, table, shapeKey } of shapes) {
    const entry = byShapeKey.get(shapeKey) ?? { table, names: new Set<string>() }
    entry.names.add(idxname)
    byShapeKey.set(shapeKey, entry)
  }
  return [...byShapeKey.values()]
    .filter(({ names }) => names.size > 1)
    .map(({ table, names }) => `${table}: ${[...names].sort().join(' vs ')}`)
}

describe('0000-00-01b-entity-relation-indexes', () => {
  beforeAll(() => loadSqlParserModule())

  it('should generate valid SQL for entity relation indexes', () => {
    const sql = idempotent()

    expect(sql.includes('idx_') || sql.trim() === '').toBe(true)
  })

  it('generates active subject-scoped best and newest indexes for election relations', () => {
    const sql = idempotent()

    expect(sql).toContain("indexname = 'idx_relation__post__category__topic__subject__best'")
    expect(sql).toContain("lower(indexdef) NOT LIKE '%object_id desc%'")
    expect(sql).toContain('DROP INDEX IF EXISTS idx_relation__post__category__topic__subject__best')
    expect(sql).toContain('idx_relation__post__category__topic__subject__best')
    expect(sql).toContain(
      'ON "relation__post__category__topic" (subject_id, votes_score_sort DESC, created_at DESC, object_id DESC)',
    )
    expect(sql).toContain("indexname = 'idx_relation__post__category__topic__subject__newest'")
    expect(sql).toContain(
      'DROP INDEX IF EXISTS idx_relation__post__category__topic__subject__newest',
    )
    expect(sql).toContain('idx_relation__post__category__topic__subject__newest')
    expect(sql).toContain(
      'ON "relation__post__category__topic" (subject_id, created_at DESC, object_id DESC)',
    )
    expect(sql).toContain('WHERE deleted_at IS NULL;')
    expect(sql).not.toContain('idx_relation__user__follow__post__subject__best')
    expect(sql).toContain('idx_relation__user__follow__post__subject__newest')
    expect(sql).not.toContain('idx_relation__user__follow__post__subject__page')
    expect(sql).toContain(
      'ON "relation__user__follow__post" (subject_id, created_at DESC, object_id DESC)',
    )
  })

  it('reuses composite newest indexes for all private user post collections', () => {
    const generatedSql = idempotent()
    for (const predicate of ['save', 'hide', 'follow', 'subscribe']) {
      expect(generatedSql).toContain(`idx_relation__user__${predicate}__post__subject__newest`)
      expect(generatedSql).toContain(
        `ON "relation__user__${predicate}__post" (subject_id, created_at DESC, object_id DESC)`,
      )
      expect(generatedSql).not.toContain(`idx_relation__user__${predicate}__post__subject__page`)
    }
  })

  it('generates the active reverse index for remote follower keyset pages', () => {
    const sql = idempotent()

    expect(sql).toContain('idx_relation__remote_actor__follow__user__active_reverse')
    expect(sql).toContain(
      'ON relation__remote_actor__follow__user (object_id, subject_id)\nWHERE deleted_at IS NULL;',
    )
  })

  it('attaches the story projection mutation fence after relation tables exist', () => {
    const sql = idempotent()

    expect(sql).toContain(
      "tgrelid = 'relation__post__related__url'::regclass\n      AND tgname = 'trigger_story_post_related_url_projection_relation_mutation'",
    )
    expect(sql).toContain(
      'CREATE TRIGGER trigger_story_post_related_url_projection_relation_mutation',
    )
    expect(
      sql.match(/CREATE TRIGGER trigger_story_post_related_url_projection_relation_mutation/g),
    ).toHaveLength(1)
  })

  it('has no differently-named indexes with an identical definition shape', () => {
    const collisions = findIndexShapeCollisions(extractIndexShapes(idempotent()))

    expect(collisions).toEqual([])
  })

  it('rejects a previous and current index with an equivalent shape but different names', () => {
    // Simulates the PR #8189 near-incident: a bare rename (old name -> new name, identical
    // body) leaves both names live on an already-migrated database. The generator's
    // per-index `DROP INDEX IF EXISTS <name>` never targets the old name, so this must be
    // caught structurally, not by trusting the rename to clean up after itself.
    const sql = `
      CREATE INDEX IF NOT EXISTS idx_relation__post__category__topic__subject__best_old ON "relation__post__category__topic" (subject_id) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_relation__post__category__topic__subject__best ON "relation__post__category__topic" (subject_id) WHERE deleted_at IS NULL;
    `

    const collisions = findIndexShapeCollisions(extractIndexShapes(sql))

    expect(collisions).toEqual([
      'relation__post__category__topic: idx_relation__post__category__topic__subject__best vs idx_relation__post__category__topic__subject__best_old',
    ])
  })
})

describe('extractIndexShapes', () => {
  beforeAll(() => loadSqlParserModule())

  it('returns an empty array for blank SQL without invoking the parser', () => {
    expect(extractIndexShapes('')).toEqual([])
    expect(extractIndexShapes('   ')).toEqual([])
  })

  it('throws rather than silently treating unparseable SQL as containing no indexes', () => {
    expect(() => extractIndexShapes('CREATE INDEX (')).toThrow('syntax error')
  })

  it('skips anonymous indexes and indexes nested inside DO blocks', () => {
    const sql = `
      CREATE INDEX ON "foo" (bar_id);
      DO $$
      BEGIN
        CREATE INDEX IF NOT EXISTS idx_in_do_block ON "foo" (bar_id);
      END $$;
    `

    expect(extractIndexShapes(sql)).toEqual([])
  })

  it('assigns an identical shape key to differently-named but byte-identical index bodies', () => {
    const sql = `
      CREATE INDEX IF NOT EXISTS idx_a ON "foo" (bar_id) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_b ON "foo" (bar_id) WHERE deleted_at IS NULL;
    `

    const shapes = extractIndexShapes(sql)

    expect(shapes.map(shape => shape.idxname)).toEqual(['idx_a', 'idx_b'])
    expect(shapes.map(shape => shape.table)).toEqual(['foo', 'foo'])
    expect(shapes[0]!.shapeKey).toBe(shapes[1]!.shapeKey)
  })

  it('assigns different shape keys to indexes with different columns', () => {
    const sql = `
      CREATE INDEX IF NOT EXISTS idx_a ON "foo" (bar_id);
      CREATE INDEX IF NOT EXISTS idx_b ON "foo" (baz_id);
    `

    const shapes = extractIndexShapes(sql)

    expect(shapes[0]!.shapeKey).not.toBe(shapes[1]!.shapeKey)
  })

  it('assigns an identical shape key to implicit and explicit ASC ordering', () => {
    const sql = `
      CREATE INDEX IF NOT EXISTS idx_a ON "foo" (bar_id);
      CREATE INDEX IF NOT EXISTS idx_b ON "foo" (bar_id ASC);
    `

    const shapes = extractIndexShapes(sql)

    expect(shapes[0]!.shapeKey).toBe(shapes[1]!.shapeKey)
  })

  it('assigns an identical shape key to a predicate with redundant parentheses', () => {
    const sql = `
      CREATE INDEX IF NOT EXISTS idx_a ON "foo" (bar_id) WHERE (deleted_at IS NULL);
      CREATE INDEX IF NOT EXISTS idx_b ON "foo" (bar_id) WHERE ((deleted_at IS NULL));
    `

    const shapes = extractIndexShapes(sql)

    expect(shapes[0]!.shapeKey).toBe(shapes[1]!.shapeKey)
  })

  it('resolves implicit NULLS ordering against PostgreSQL’s direction-dependent default', () => {
    const ascSql = `
      CREATE INDEX IF NOT EXISTS idx_a ON "foo" (bar_id);
      CREATE INDEX IF NOT EXISTS idx_b ON "foo" (bar_id NULLS LAST);
    `
    const descSql = `
      CREATE INDEX IF NOT EXISTS idx_a ON "foo" (bar_id DESC);
      CREATE INDEX IF NOT EXISTS idx_b ON "foo" (bar_id DESC NULLS FIRST);
    `

    const ascShapes = extractIndexShapes(ascSql)
    const descShapes = extractIndexShapes(descSql)

    expect(ascShapes[0]!.shapeKey).toBe(ascShapes[1]!.shapeKey)
    expect(descShapes[0]!.shapeKey).toBe(descShapes[1]!.shapeKey)
  })

  it('assigns different shape keys to ascending vs. descending ordering', () => {
    const sql = `
      CREATE INDEX IF NOT EXISTS idx_a ON "foo" (bar_id ASC);
      CREATE INDEX IF NOT EXISTS idx_b ON "foo" (bar_id DESC);
    `

    const shapes = extractIndexShapes(sql)

    expect(shapes[0]!.shapeKey).not.toBe(shapes[1]!.shapeKey)
  })
})
