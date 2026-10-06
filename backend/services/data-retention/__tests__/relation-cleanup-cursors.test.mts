import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { electedRelationMetadata } from '@services/users/relation-impact-targets'
import { acquireTestPostgresAdvisoryLock } from '@voucha/test-helpers/postgres-advisory-lock'
import {
  getRetainedRelationCleanupCursors,
  readTestRetainedRelationCleanupCursor,
  restoreTestRetainedRelationCleanupCursor,
} from '../../../test-helpers/entities/retained-relation-cursors.mts'
import {
  hasTestRetainedRelationIdentity,
  insertTestRetainedIdentityRoot,
  insertTestRetainedRelationIdentity,
} from '@voucha/test-helpers'
import { cleanupRetainedRelationIdentities } from '../cleanup-retained-relation-identities.mts'

function retainedRootFamily(subjectType: string): 'user' | 'post' | 'topic' {
  if (subjectType === 'user' || subjectType === 'post' || subjectType === 'topic')
    return subjectType
  throw new Error(`Relation cursor test cannot seed ${subjectType} roots`)
}

describe('retained relation cleanup cursors', () => {
  it('creates a missing cursor and reuses it while leaving foreign tuples', async () => {
    const lock = await acquireTestPostgresAdvisoryLock({
      namespace: 2_135_045,
      key: 1,
      timeout: '20s',
    })
    const metadata = electedRelationMetadata[0]!
    const table = metadata.table_name
    const family = retainedRootFamily(metadata.subject_type)
    const previous = await readTestRetainedRelationCleanupCursor(table)
    const ownedSubjectId = v7()
    const ownedRelationId = v7()
    const foreignSubjectId = v7()
    const foreignRelationId = v7()
    try {
      await restoreTestRetainedRelationCleanupCursor(table, null)
      await insertTestRetainedIdentityRoot(family, ownedSubjectId)
      await insertTestRetainedIdentityRoot(family, foreignSubjectId)
      await insertTestRetainedRelationIdentity(table, ownedSubjectId, ownedRelationId)
      await insertTestRetainedRelationIdentity(table, foreignSubjectId, foreignRelationId)
      const keys = [{ subjectId: ownedSubjectId, relationId: ownedRelationId }]
      const [created] = await cleanupRetainedRelationIdentities(
        1_000,
        { [table]: keys },
        { ensureCursors: true },
      )
      expect(created).toMatchObject({
        relationTable: table,
        scanned: 1,
        deleted: 1,
        hasMore: false,
      })
      expect(await getRetainedRelationCleanupCursors()).toContain(table)
      expect(
        (await getRetainedRelationCleanupCursors()).filter(name => name === table),
      ).toHaveLength(1)
      expect(await hasTestRetainedRelationIdentity(table, ownedSubjectId, ownedRelationId)).toBe(
        false,
      )
      expect(
        await hasTestRetainedRelationIdentity(table, foreignSubjectId, foreignRelationId),
      ).toBe(true)
      await cleanupRetainedRelationIdentities(1_000, { [table]: keys }, { ensureCursors: true })
      expect(
        (await getRetainedRelationCleanupCursors()).filter(name => name === table),
      ).toHaveLength(1)
      expect(
        await hasTestRetainedRelationIdentity(table, foreignSubjectId, foreignRelationId),
      ).toBe(true)
    } finally {
      await restoreTestRetainedRelationCleanupCursor(table, previous)
      await lock.release()
    }
  })
})
