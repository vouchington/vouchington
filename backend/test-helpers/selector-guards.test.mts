import { describe, expect, it, vi } from 'vitest'
import {
  getEntityRelation,
  hardDeleteEntityRelationTest,
  insertEntityRelation,
  setEntityRelationCreatedAt,
  setEntityRelationDeletedAt,
  setTestEntityRelationIdAndScore,
  softDeleteEntityRelationTest,
  updateTestEntityRelationCreatedAt,
} from './entities/entity-relations.mts'
import {
  getLatestTestEntityRelationVoteScore,
  insertTestEntityRelationVote,
  readTestEntityRelationUserVotePage,
} from './entities/entity-relation-votes.mts'
import { countTestRelationRows } from './data-stores/psql/moderation-admission-relations.mts'
import {
  hasTestRetainedIdentityRoot,
  hasTestRetainedRelationIdentity,
  insertTestRetainedRelationIdentity,
  insertTestRetainedRelationImpact,
  readTestRetainedIdentityTraversalBound,
  readTestRetainedRelationTraversalBound,
} from './entities/retained-identities.mts'
import { setTestPostClearanceStatus } from './entities/post-clearance.mts'

describe('test fixture selector guards', () => {
  it.each(['unexpected', 'relation__user__follow__user', '__proto__'])(
    'rejects retained relation selector %s before a query or transaction',
    async relationTable => {
      await expect(
        insertTestRetainedRelationImpact({
          relationTable,
          requestId: 'unused-id',
          subjectId: 'unused-id',
          relationId: 'unused-id',
        }),
      ).rejects.toThrow('Unknown elected relation table:')
      await expect(
        insertTestRetainedRelationIdentity(relationTable, 'unused-id', 'unused-id'),
      ).rejects.toThrow('Unknown elected relation table:')
      await expect(
        hasTestRetainedRelationIdentity(relationTable, 'unused-id', 'unused-id'),
      ).rejects.toThrow('Unknown elected relation table:')
      await expect(readTestRetainedRelationTraversalBound(relationTable, 10)).rejects.toThrow(
        'Unknown elected relation table:',
      )
    },
  )

  const relationSelectors = [
    { name: 'insert', run: (table: string) => insertEntityRelation(table, 'unused', 'unused') },
    { name: 'read', run: (table: string) => getEntityRelation(table, 'unused', 'unused') },
    {
      name: 'hard delete',
      run: (table: string) => hardDeleteEntityRelationTest(table, 'unused', 'unused'),
    },
    {
      name: 'soft delete',
      run: (table: string) => softDeleteEntityRelationTest(table, 'unused', 'unused'),
    },
    {
      name: 'creation time',
      run: (table: string) => setEntityRelationCreatedAt(table, 'unused', 'unused', new Date(0)),
    },
    {
      name: 'updated creation time',
      run: (table: string) =>
        updateTestEntityRelationCreatedAt(table, 'unused', 'unused', new Date(0)),
    },
    {
      name: 'deletion time',
      run: (table: string) => setEntityRelationDeletedAt(table, 'unused', 'unused', new Date(0)),
    },
    {
      name: 'score',
      run: (table: string) =>
        setTestEntityRelationIdAndScore(table, 'unused', 'unused', 'unused', 1),
    },
    {
      name: 'vote insert',
      run: (relationTable: string) =>
        insertTestEntityRelationVote({
          relationTable,
          relationId: 'unused',
          subjectId: 'unused',
          userId: 'unused',
          score: 1,
        }),
    },
    {
      name: 'vote score',
      run: (relationTable: string) =>
        getLatestTestEntityRelationVoteScore({
          relationTable,
          relationId: 'unused',
          userId: 'unused',
        }),
    },
    {
      name: 'vote page',
      run: (table: string) => readTestEntityRelationUserVotePage('unused', table, { limit: 1 }),
    },
  ]

  it.each(relationSelectors)('$name rejects an inherited selector before SQL', async ({ run }) => {
    await expect(run('__proto__')).rejects.toThrow('Invalid')
  })

  it.each(relationSelectors)(
    '$name rejects a non-string selector without coercion',
    async ({ run }) => {
      const coerce = vi.fn<() => string>(() => 'relation__post__category__topic')
      const key = { [Symbol.toPrimitive]: coerce }
      await expect(run(key as unknown as string)).rejects.toThrow(/relation/)
      expect(coerce).not.toHaveBeenCalled()
    },
  )

  it('rejects an unknown retained identity family before a query', async () => {
    const family = 'unexpected' as Parameters<typeof hasTestRetainedIdentityRoot>[0]

    await expect(hasTestRetainedIdentityRoot(family, 'unused-id')).rejects.toThrow(
      'Unknown retained identity family',
    )
    await expect(readTestRetainedIdentityTraversalBound(family, 10)).rejects.toThrow(
      'Unknown retained identity family',
    )
  })

  it('rejects an unknown clearance status before a write', async () => {
    const status = 'unexpected' as Parameters<typeof setTestPostClearanceStatus>[1]

    await expect(setTestPostClearanceStatus('unused-id', status)).rejects.toThrow(
      'Unknown clearance status',
    )
  })

  it('rejects an unknown moderation relation before a read', async () => {
    const relation = 'unexpected' as Parameters<typeof countTestRelationRows>[0]

    await expect(countTestRelationRows(relation, 'unused-id')).rejects.toThrow('Unknown relation')
  })
})
