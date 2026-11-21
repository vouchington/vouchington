import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { withTwoOpenTransactionsForTest } from '@voucha/test-helpers/two-open-transactions'
import { electedRelationMetadata } from '@services/users/relation-impact-targets'
import {
  hasTestRetainedRelationIdentity,
  insertTestRetainedIdentityRoot,
  insertTestRetainedRelationIdentity,
} from '@voucha/test-helpers'
import { cleanupRetainedRelationIdentities } from '../cleanup-retained-relation-identities.mts'

describe('concurrent retained relation cleanup', () => {
  it('deletes a retained relation once when two runs claim the same tuple', async () => {
    const metadata = electedRelationMetadata.find(item => item.subject_type === 'user')!
    const subjectId = v7()
    const relationId = v7()
    await insertTestRetainedIdentityRoot('user', subjectId)
    await insertTestRetainedRelationIdentity(metadata.table_name, subjectId, relationId)
    const keys = { [metadata.table_name]: [{ subjectId, relationId }] }
    // The first run holds the row lock from its delete; the second must skip, not wait or repeat.
    const [firstPages, secondPages] = await withTwoOpenTransactionsForTest(
      async (first, second) => {
        const firstRun = await cleanupRetainedRelationIdentities(10, keys, { query: first })
        const secondRun = await cleanupRetainedRelationIdentities(10, keys, { query: second })
        await first.commit()
        await second.commit()
        return [firstRun, secondRun] as const
      },
    )

    expect(firstPages.map(page => page.deleted)).toEqual([1])
    expect(secondPages.map(page => page.deleted)).toEqual([0])
    expect(await hasTestRetainedRelationIdentity(metadata.table_name, subjectId, relationId)).toBe(
      false,
    )
  })
})
