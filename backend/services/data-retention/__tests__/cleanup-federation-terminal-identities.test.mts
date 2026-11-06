import { deleteTestRetainedPostIdentity } from '@voucha/test-helpers/data-stores/psql/moderation-admission-relations'
import { describe, expect, it, onTestFinished } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestPost,
  hardDeleteTestPost,
  deleteOperationalRetainedLikeReferenceForTest,
} from '@voucha/test-helpers'
import {
  createFederatedUser,
  createRemoteActorFixture,
} from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import {
  withCommittedPostgresTransactionForTest,
  withPostgresTransactionForTest,
} from '@voucha/test-helpers/postgres-transaction'
import {
  readFollowCyclePointerForTest,
  readTerminalActivityIdentitiesForTest,
  setTerminalActivityTimeForTest,
} from '@voucha/test-helpers/activitypub-terminal-identities'
import { dispatchInboundActivity } from '@services/ap-inbox-activities/dispatch-activity'
import {
  activityPubInboxConfig,
  getMaximumActivityAgeDays,
  getTerminalActivityIdentityRetentionDays,
  MAXIMUM_ACTIVITY_AGE_DAYS_LIMIT,
} from '@services/ap-inbox-activities/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getActorUri, getPostUri } from '@modules/activitypub-uris'
import { deleteTerminalRetentionFixtureForTest } from '@voucha/test-helpers/terminal-retention-cleanup'
import { cleanupActivityPubTerminalIdentities } from '../cleanup-activitypub-tombstones.mts'

const activityId = () => `https://remote.example/activities/${randomUUID()}`

describe('finite ActivityPub terminal identity retention', () => {
  it.each(['Follow', 'Like'] as const)(
    'expires only old terminal %s identities from transition time, preserving active cycles',
    async type => {
      const actor = await createRemoteActorFixture()
      const user = type === 'Follow' ? await createFederatedUser() : null
      const post = type === 'Like' ? await createTestPost() : null
      const target = type === 'Follow' ? getActorUri(user!.id) : getPostUri(post!.id)
      const kind = type === 'Follow' ? 'follow' : 'like'
      const [oldId, recentId, activeId] = [activityId(), activityId(), activityId()]
      const activityIds = [oldId!, recentId!, activeId!]
      onTestFinished(async () => {
        if (post) {
          await hardDeleteTestPost(post.id)
          await withCommittedPostgresTransactionForTest(query =>
            Promise.all(
              activityIds.map(id => deleteOperationalRetainedLikeReferenceForTest(query, id)),
            ),
          )
          await deleteTestRetainedPostIdentity(post.id)
        }
        await deleteTerminalRetentionFixtureForTest({
          actorId: actor.id,
          actorUri: actor.actor_uri,
          userId: user?.id ?? post?.created_by_id ?? null,
          activityIds,
        })
      })
      for (const id of [oldId!, recentId!]) {
        await dispatchInboundActivity(actor, { id, type, actor: actor.actor_uri, object: target })
        const undoId = activityId()
        activityIds.push(undoId)
        await dispatchInboundActivity(actor, {
          id: undoId,
          type: 'Undo',
          actor: actor.actor_uri,
          object: { id, type, object: target },
        })
      }
      await dispatchInboundActivity(actor, {
        id: activeId!,
        type,
        actor: actor.actor_uri,
        object: target,
      })
      const now = new Date()
      const cutoff = new Date(
        now.getTime() - getTerminalActivityIdentityRetentionDays() * 86_400_000,
      )
      const before = await withCommittedPostgresTransactionForTest(async query => {
        await setTerminalActivityTimeForTest(query, kind, oldId!, new Date(cutoff.getTime() - 1))
        await setTerminalActivityTimeForTest(query, kind, recentId!, cutoff)
        return readTerminalActivityIdentitiesForTest(query, kind, [oldId!, recentId!, activeId!])
      })
      const result = await cleanupActivityPubTerminalIdentities(kind, {
        batchSize: 1,
        maxBatches: 1,
        now,
        identityIds: before.map(row => row.id),
      })
      expect(result.deleted).toBe(1)
      expect(result.hasMore).toBe(true)
      await withPostgresTransactionForTest(async query => {
        const after = await readTerminalActivityIdentitiesForTest(query, kind, [
          oldId!,
          recentId!,
          activeId!,
        ])
        expect(after.map(row => row.activityId).toSorted()).toEqual([recentId, activeId].toSorted())
        expect(after.find(row => row.activityId === activeId)!.terminalAt).toBeNull()
      })
    },
  )

  it('marks each displaced Follow id terminal while keeping the latest cycle live', async () => {
    const actor = await createRemoteActorFixture()
    const target = getActorUri((await createFederatedUser()).id)
    const ids = [activityId(), activityId(), activityId()]
    for (const id of ids)
      await dispatchInboundActivity(actor, {
        id,
        type: 'Follow',
        actor: actor.actor_uri,
        object: target,
      })
    await withPostgresTransactionForTest(async query => {
      const rows = await readTerminalActivityIdentitiesForTest(query, 'follow', ids)
      expect(rows.filter(row => row.terminalAt === null).map(row => row.activityId)).toEqual([
        ids[2],
      ])
      expect(rows.filter(row => row.terminalAt !== null)).toHaveLength(2)
    })
  })

  it('expires an undone Follow cycle by clearing only its optional relation pointer', async () => {
    const actor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const id = activityId()
    const undoId = activityId()
    onTestFinished(() =>
      deleteTerminalRetentionFixtureForTest({
        actorId: actor.id,
        actorUri: actor.actor_uri,
        userId: user.id,
        activityIds: [id, undoId],
      }),
    )
    await dispatchInboundActivity(actor, {
      id,
      type: 'Follow',
      actor: actor.actor_uri,
      object: getActorUri(user.id),
    })
    await dispatchInboundActivity(actor, {
      id: undoId,
      type: 'Undo',
      actor: actor.actor_uri,
      object: { id, type: 'Follow', object: getActorUri(user.id) },
    })
    const now = new Date()
    const cutoff = new Date(now.getTime() - getTerminalActivityIdentityRetentionDays() * 86_400_000)
    const identity = await withCommittedPostgresTransactionForTest(async query => {
      await setTerminalActivityTimeForTest(query, 'follow', id, new Date(cutoff.getTime() - 1))
      const [identity] = await readTerminalActivityIdentitiesForTest(query, 'follow', [id])
      expect(await readFollowCyclePointerForTest(query, actor.id, user.id)).toMatchObject({
        inbound_follow_activity_row_id: identity!.id,
      })
      return identity!
    })
    const result = await cleanupActivityPubTerminalIdentities('follow', {
      batchSize: 1,
      maxBatches: 1,
      now,
      identityIds: [identity.id],
    })
    expect(result.deleted).toBe(1)
    expect(result.hasMore).toBe(true)
    await withPostgresTransactionForTest(async query => {
      expect(await readFollowCyclePointerForTest(query, actor.id, user.id)).toEqual({
        subject_id: actor.id,
        object_id: user.id,
        inbound_follow_activity_row_id: null,
      })
    })
  })

  it('keeps terminal retention beyond a later increase of the replay window', () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
        maximum_activity_age_days: MAXIMUM_ACTIVITY_AGE_DAYS_LIMIT,
        terminal_identity_retention_days: 1,
      }),
    )
    expect(getTerminalActivityIdentityRetentionDays()).toBeGreaterThan(getMaximumActivityAgeDays())
  })
})
