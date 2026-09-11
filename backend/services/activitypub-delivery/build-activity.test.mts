import { describe, expect, it } from 'vitest'
import { getActivityUri, getActorUri, getPostUri } from '@modules/activitypub-uris'
import { buildActivityJson } from './build-activity.mts'
import type { BuildActivityInput } from './types.mts'

describe('buildActivityJson', () => {
  it('builds a Follow activity targeting the target user actor URI', () => {
    const input: BuildActivityInput = {
      activityId: 'activity-1',
      activityType: 'Follow',
      sourceUserId: 'user-1',
      targetUserId: 'user-2',
    }

    expect(buildActivityJson(input)).toEqual({
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
      id: getActivityUri('activity-1'),
      type: 'Follow',
      actor: getActorUri('user-1'),
      object: getActorUri('user-2'),
    })
  })

  it('builds a Like activity targeting the target post URI', () => {
    const input: BuildActivityInput = {
      activityId: 'activity-2',
      activityType: 'Like',
      sourceUserId: 'user-1',
      targetPostId: 'post-1',
    }

    expect(buildActivityJson(input)).toEqual({
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
      id: getActivityUri('activity-2'),
      type: 'Like',
      actor: getActorUri('user-1'),
      object: getPostUri('post-1'),
    })
  })

  it('builds an UndoLike activity wrapping a minimal embedded Like', () => {
    const input: BuildActivityInput = {
      activityId: 'activity-3',
      activityType: 'UndoLike',
      originalActivityId: 'activity-2',
      sourceUserId: 'user-1',
      targetPostId: 'post-1',
    }

    expect(buildActivityJson(input)).toEqual({
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
      id: getActivityUri('activity-3'),
      type: 'Undo',
      actor: getActorUri('user-1'),
      object: {
        id: getActivityUri('activity-2'),
        type: 'Like',
        object: getPostUri('post-1'),
      },
    })
  })

  it('builds an UndoFollow activity wrapping a minimal embedded Follow', () => {
    const input: BuildActivityInput = {
      activityId: 'activity-5',
      activityType: 'UndoFollow',
      originalActivityId: 'activity-1',
      sourceUserId: 'user-1',
      targetUserId: 'user-2',
    }

    expect(buildActivityJson(input)).toEqual({
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
      id: getActivityUri('activity-5'),
      type: 'Undo',
      actor: getActorUri('user-1'),
      object: {
        id: getActivityUri('activity-1'),
        type: 'Follow',
        object: getActorUri('user-2'),
      },
    })
  })

  it('builds an Accept activity embedding the original Follow', () => {
    const input: BuildActivityInput = {
      activityId: 'activity-6',
      activityType: 'Accept',
      sourceUserId: 'user-2',
      followActivityId: 'https://remote.example/activities/follow-1',
      followActorUri: 'https://remote.example/users/alice',
    }

    expect(buildActivityJson(input)).toEqual({
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
      id: getActivityUri('activity-6'),
      type: 'Accept',
      actor: getActorUri('user-2'),
      object: {
        id: 'https://remote.example/activities/follow-1',
        type: 'Follow',
        actor: 'https://remote.example/users/alice',
        object: getActorUri('user-2'),
      },
    })
  })

  it('throws for an unknown activity type', () => {
    const input = {
      activityId: 'activity-4',
      activityType: 'Announce',
      sourceUserId: 'user-1',
      targetPostId: 'post-1',
    } as unknown as BuildActivityInput

    expect(() => buildActivityJson(input)).toThrow(/Unknown outbound activity type/)
  })
})
