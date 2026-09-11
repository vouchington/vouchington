import { describe, expect, it } from 'vitest'
import {
  createUserFollowRelationUpdateStatementForTest,
  createUserMuteRelationUpdateStatementForTest,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import {
  appendDeletedRelationReturning,
  getDeletedFollowPairs,
} from './deleted-relation-results.mts'

const followRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  predicate: 'follow',
  objectType: 'user',
})
const muteRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  predicate: 'mute',
  objectType: 'user',
})

describe('deleted relation results', () => {
  it('returns ActivityPub identities only for user Follow deletions', () => {
    const followQuery = createUserFollowRelationUpdateStatementForTest()
    appendDeletedRelationReturning(followQuery, followRelation)

    expect(followQuery.text).toContain(
      'RETURNING subject_id, object_id, outbound_ap_follow_activity_id, uuidv7() AS undo_activity_id',
    )

    const muteQuery = createUserMuteRelationUpdateStatementForTest()
    appendDeletedRelationReturning(muteQuery, muteRelation)

    expect(muteQuery.text).toContain('RETURNING subject_id, object_id')
    expect(muteQuery.text).not.toContain('outbound_ap_follow_activity_id')
    expect(muteQuery.text).not.toContain('undo_activity_id')
  })

  it('preserves every deleted row while retaining only known ActivityPub identities', () => {
    expect(
      getDeletedFollowPairs([
        {
          subject_id: 'follower',
          object_id: 'followee',
          outbound_ap_follow_activity_id: 'follow-activity',
          undo_activity_id: 'undo-activity',
        },
        {
          subject_id: 'missing-undo',
          object_id: 'followee',
          outbound_ap_follow_activity_id: 'follow-activity',
        },
        {
          subject_id: 'missing-original',
          object_id: 'followee',
          undo_activity_id: 'undo-activity',
        },
      ]),
    ).toEqual([
      {
        subjectId: 'follower',
        objectId: 'followee',
        activityPubUndoIdentity: {
          originalActivityId: 'follow-activity',
          undoActivityId: 'undo-activity',
        },
      },
      {
        subjectId: 'missing-undo',
        objectId: 'followee',
        activityPubUndoIdentity: null,
      },
      {
        subjectId: 'missing-original',
        objectId: 'followee',
        activityPubUndoIdentity: null,
      },
    ])
  })
})
