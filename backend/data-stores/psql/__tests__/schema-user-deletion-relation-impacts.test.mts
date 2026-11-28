import { describe, expect, it } from 'vitest'
import {
  completeAndPurgeEffectImpact,
  insertCrossRequestImpactPointer,
  insertEffectWorkWithoutImpactPointer,
  insertImpactWithMismatchedSubject,
  insertImpactWithWrongConcreteTable,
} from '../../../test-helpers/data-stores/psql/schema-user-deletion-relation-impacts.mts'

describe('concrete user deletion relation impacts', () => {
  it('rejects a mismatched subject even when the relation ID exists', async () => {
    await expect(insertImpactWithMismatchedSubject()).rejects.toMatchObject({ code: '23503' })
  })

  it('rejects a relation ID from the wrong concrete retained table', async () => {
    await expect(insertImpactWithWrongConcreteTable()).rejects.toMatchObject({ code: '23503' })
  })

  it('rejects a relation-effects pointer into another deletion request', async () => {
    await expect(insertCrossRequestImpactPointer()).rejects.toMatchObject({ code: '23503' })
  })

  it('rejects pending relation effects without a typed impact pointer', async () => {
    await expect(insertEffectWorkWithoutImpactPointer()).rejects.toMatchObject({ code: '23514' })
  })

  it('requires a pending effect pointer and clears only that pointer after completion', async () => {
    const { requestId, row } = await completeAndPurgeEffectImpact()
    expect(row).toEqual({
      request_id: requestId,
      relation_impact_id: null,
      work_key: null,
    })
  })
})
