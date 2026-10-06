import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import type { SharedDbScopeEvent } from '@data-stores/psql/shared-db-scope-observer'
import { electedRelationMetadata } from '@services/users/relation-impact-targets'
import { hasTestRetainedIdentityRoot, insertTestRetainedIdentityRoot } from '@voucha/test-helpers'
import { installSharedDbScopeObserver } from '../../../../test-helpers/vitest-shared-db-scope-observer.mts'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'
import { cleanupRetainedRelationIdentities } from '../cleanup-retained-relation-identities.mts'

const rootEvent = (ids: string[]): SharedDbScopeEvent => ({
  operation: 'cleanupRetainedIdentityRoots',
  table: 'retained_identity_cleanup_cursors',
  scope: { kind: 'ids', ids },
})
const relationEvent = (ids: string[]): SharedDbScopeEvent => ({
  operation: 'cleanupRetainedRelationIdentities',
  table: 'retained_relation_identity_cleanup_cursors',
  scope: { kind: 'ids', ids },
})

async function observe<T>(
  run: () => Promise<T>,
  observer?: (event: SharedDbScopeEvent) => void,
): Promise<{ result: T; events: SharedDbScopeEvent[] }> {
  const events: SharedDbScopeEvent[] = []
  const dispose = installSharedDbScopeObserver(event => {
    events.push(event)
    observer?.(event)
  })
  try {
    return { result: await run(), events }
  } finally {
    dispose()
  }
}

describe('retained cleanup shared-database scope observation', () => {
  it('observes each scoped root family with its exact ids and still reclaims the roots', async () => {
    const [postId, topicId] = [v7(), v7()]
    await Promise.all([
      insertTestRetainedIdentityRoot('post', postId),
      insertTestRetainedIdentityRoot('topic', topicId),
    ])
    const { events } = await observe(() =>
      cleanupRetainedIdentityRoots(1_000, { post: [postId], topic: [topicId] }),
    )
    expect(events).toEqual([rootEvent([topicId]), rootEvent([postId])])
    expect(await hasTestRetainedIdentityRoot('post', postId)).toBe(false)
    expect(await hasTestRetainedIdentityRoot('topic', topicId)).toBe(false)
  })

  it('observes each scoped relation tuple by its subject and relation ids', async () => {
    const relationTable = electedRelationMetadata[0]!.table_name
    const [subjectId, relationId, otherSubjectId, otherRelationId] = [v7(), v7(), v7(), v7()]
    const { result, events } = await observe(() =>
      cleanupRetainedRelationIdentities(1_000, {
        [relationTable]: [
          { subjectId, relationId },
          { subjectId: otherSubjectId, relationId: otherRelationId },
        ],
      }),
    )
    expect(events).toEqual([
      relationEvent([subjectId, relationId, otherSubjectId, otherRelationId]),
    ])
    expect(result).toEqual([{ relationTable, scanned: 0, deleted: 0, hasMore: false }])
  })

  it('does not observe an explicit empty scope because it runs no query', async () => {
    const { result, events } = await observe(async () => [
      await cleanupRetainedIdentityRoots(1_000, {}),
      await cleanupRetainedIdentityRoots(1_000, { post: [] }),
      await cleanupRetainedRelationIdentities(1_000, {}),
      await cleanupRetainedRelationIdentities(1_000, {
        [electedRelationMetadata[0]!.table_name]: [],
      }),
    ])
    expect(result).toEqual([[], [], [], []])
    expect(events).toEqual([])
  })

  it('observes the unscoped production defaults as global before any query runs', async () => {
    const reject = () => {
      throw new Error('unscoped cleanup rejected')
    }
    const roots = await observe(async () => {
      await expect(cleanupRetainedIdentityRoots()).rejects.toThrow('unscoped cleanup rejected')
    }, reject)
    const relations = await observe(async () => {
      await expect(cleanupRetainedRelationIdentities()).rejects.toThrow('unscoped cleanup rejected')
    }, reject)
    expect(roots.events).toEqual([
      {
        operation: 'cleanupRetainedIdentityRoots',
        table: 'retained_identity_cleanup_cursors',
        scope: { kind: 'global' },
      },
    ])
    expect(relations.events).toEqual([
      {
        operation: 'cleanupRetainedRelationIdentities',
        table: 'retained_relation_identity_cleanup_cursors',
        scope: { kind: 'global' },
      },
    ])
  })
})
