import { describe, it, expect } from 'vitest'
import { dispatchInboundActivity } from './dispatch-activity.mts'
import { createRemoteActorFixture, createFederatedUser } from './test-fixtures.mts'
import { getActorUri } from '@modules/activitypub-uris'
import { createTestUserDirect } from '@voucha/test-helpers'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

// Codex review round 2, fix #6: an inbound Follow must be acknowledged with an Accept back to the
// sender's inbox, or the relationship stays "pending" on the sender's side forever (see
// dispatch-activity.mts's handleFollow). Split into its own file (rather than dispatch-activity.test.mts)
// to stay under the 300-line file cap, matching entity-relations' upsert-follow-retry.test.mts split.
describe('dispatchInboundActivity Accept acknowledgement', () => {
  it('returns an Accept action for a Follow activity', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const followActivityId = `https://remote.example/activities/${randomSuffix()}`
    const activity = {
      id: followActivityId,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    }

    const action = await dispatchInboundActivity(remoteActor, activity)

    expect(action).toEqual({
      type: 'send-follow-accept',
      remoteActor,
      activity,
      targetUserId: user.id,
    })
  })

  it('returns no Accept action when the target user has not enabled federation', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createTestUserDirect()
    const followActivityId = `https://remote.example/activities/${randomSuffix()}`

    const action = await dispatchInboundActivity(remoteActor, {
      id: followActivityId,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    })

    expect(action).toBeUndefined()
  })
})
