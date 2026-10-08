import { describe, expect, it } from 'vitest'
import { extractIndexShapes } from 'vouchington-tooling/sql-ast'
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
    .map(({ table, names }) => `${table}: ${[...names].toSorted().join(' vs ')}`)
}

describe('0000-00-01b-entity-relation-indexes', () => {
  it('should generate valid SQL for entity relation indexes', () => {
    const sql = idempotent()

    expect(sql.includes('idx_') || sql.trim() === '').toBe(true)
  })

  it('generates active subject-scoped best and newest indexes for election relations', () => {
    const sql = idempotent()

    expect(sql).toContain('idx_relation__post__category__topic__subject__best')
    expect(sql).toContain(
      'ON "relation__post__category__topic" (subject_id, votes_score_sort DESC, created_at DESC, object_id DESC)',
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

  it('adds the mutation fence foreign key once, after the relation table exists', () => {
    const sql = idempotent()
    const constraint = 'story_post_url_projection_mutations_relation_fkey'

    expect(sql).toContain(
      'FOREIGN KEY (post_id, relation_id) REFERENCES relation__post__related__url (subject_id, id) ON DELETE CASCADE NOT VALID',
    )
    expect(sql).toContain(`VALIDATE CONSTRAINT ${constraint}`)
    expect(sql.match(new RegExp(`ADD CONSTRAINT ${constraint}`, 'g'))).toHaveLength(1)
  })

  it('has no differently-named indexes with an identical definition shape', async () => {
    const collisions = findIndexShapeCollisions(await extractIndexShapes(idempotent()))

    expect(collisions).toEqual([])
  })

  it('rejects a previous and current index with an equivalent shape but different names', async () => {
    // A renamed duplicate in current generator output must fail structurally.
    const sql = `
      CREATE INDEX IF NOT EXISTS idx_relation__post__category__topic__subject__best_old ON "relation__post__category__topic" (subject_id) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_relation__post__category__topic__subject__best ON "relation__post__category__topic" (subject_id) WHERE deleted_at IS NULL;
    `

    const collisions = findIndexShapeCollisions(await extractIndexShapes(sql))

    expect(collisions).toEqual([
      'relation__post__category__topic: idx_relation__post__category__topic__subject__best vs idx_relation__post__category__topic__subject__best_old',
    ])
  })
})
