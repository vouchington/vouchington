import { describe, expect, it } from 'vitest'
import { electedRelationMetadata } from '@services/users/relation-impact-targets'
import {
  clearRetainedRelationCleanupCursors,
  getRetainedRelationCleanupCursors,
} from '../../../test-helpers/entities/retained-relation-cursors.mts'
import { runIsolatedDatabaseCase } from '../../../../test-helpers/vitest-isolated-database-case.mts'
import { getIsolatedDatabaseCaseMode } from '../../../../test-helpers/vitest-isolated-database-cases.mts'
import { cleanupRetainedRelationIdentities } from '../cleanup-retained-relation-identities.mts'

describe('retained relation cleanup cursors', () => {
  it('creates all missing cursors and reuses them on replay', async () => {
    if (getIsolatedDatabaseCaseMode('retained-relation-cursors') === 'parent') {
      await runIsolatedDatabaseCase('retained-relation-cursors')
      return
    }
    await clearRetainedRelationCleanupCursors()
    expect(await getRetainedRelationCleanupCursors()).toEqual([])
    await cleanupRetainedRelationIdentities()
    expect(await getRetainedRelationCleanupCursors()).toEqual(
      electedRelationMetadata.map(metadata => metadata.table_name),
    )
    await cleanupRetainedRelationIdentities()
    expect(await getRetainedRelationCleanupCursors()).toEqual(
      electedRelationMetadata.map(metadata => metadata.table_name),
    )
  }, 240_000)
})
