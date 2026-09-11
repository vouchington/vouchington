import { describe, expect, it } from 'vitest'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { getNotificationReconcilePlan } from './notification-reconcile.mts'

describe('getNotificationReconcilePlan', () => {
  it('never schedules notification reconciliation for user tags', () => {
    const userTags = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'category',
      objectType: 'topic',
    })

    expect(
      getNotificationReconcilePlan(userTags, [
        {
          id: '00000000-0000-7000-8000-000000000001',
          subject_id: '00000000-0000-7000-8000-000000000002',
          object_id: '00000000-0000-7000-8000-000000000003',
          created_at: new Date(),
          created_by_id: '00000000-0000-7000-8000-000000000004',
        },
      ]),
    ).toBeNull()
  })
})
