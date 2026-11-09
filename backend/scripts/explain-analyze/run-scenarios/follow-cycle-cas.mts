import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { getEntityRelationMetadataOrThrow, upsertEntityRelation } from '@services/entity-relations'
import {
  markRemoteFollowUndone,
  readRemoteFollowCyclePointer,
  reserveRemoteFollowCycle,
  retireRemoteFollowCycle,
} from '@services/ap-inbox-activities/follow-cycles'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const relation = getEntityRelationMetadataOrThrow({
  subjectType: 'remote_actor',
  predicate: 'follow',
  objectType: 'user',
})
const actor = { id: seedUuid(0, '19'), actor_uri: 'https://remote-follower-0.example/users/actor' }
const targetId = seedUuid(19_991, '01')
const activity = () => `${actor.actor_uri}/activities/explain-${randomUUID()}`

async function reserve(id: string): Promise<string> {
  await using query = await beginTransaction()
  const cycle = await reserveRemoteFollowCycle(id, actor.id, targetId, { query })
  await query.commit()
  return cycle.id
}

/** Capture fresh insert, replacement CAS, and Undo-before-Follow confirmation. */
export async function runFollowCycleCasScenarios(): Promise<void> {
  const existing = await write<{ present: boolean }>(
    `/* checkExplainFollowPair */ SELECT EXISTS (SELECT 1 FROM relation__remote_actor__follow__user
     WHERE subject_id = $1::uuid AND object_id = $2::uuid) AS present`,
    [actor.id, targetId],
  )
  if (existing.rows[0]?.present) throw new Error('Explain Follow pair must be unused')
  const firstActivity = activity()
  const secondActivity = activity()
  const undoActivity = activity()
  const firstId = await reserve(firstActivity)
  const secondId = await reserve(secondActivity)
  const scopes = [
    'activitypub-follow-cas-insert',
    'activitypub-follow-cas-replace',
    'activitypub-follow-confirm-tombstone',
  ] as const
  for (const id of scopes)
    registerScenarioContract(id, {
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'relation__remote_actor__follow__user', max: 4 },
        { kind: 'maxProcessedRows', relation: 'activitypub_remote_follow_activities', max: 4 },
      ],
    })
  try {
    await runAndCapture(
      'activitypub-follow-cas-insert',
      async () => {
        await using query = await beginTransaction()
        const prior = await readRemoteFollowCyclePointer(actor.id, targetId, { query })
        assert.equal(prior, null)
        const rows = await upsertEntityRelation(null, relation, actor, [{ id: targetId }], {
          query,
          origin: 'remote',
          remoteFollowCycle: { expectedId: prior, nextId: firstId },
        })
        assert.equal(rows.length, 1)
        await query.commit()
      },
      undefined,
      ['readRemoteFollowCyclePointer', 'installRemoteFollowCycle'],
      {
        afterCapture: async () => {
          await write(
            `/* resetExplainFollowInsert */ DELETE FROM relation__remote_actor__follow__user WHERE subject_id = $1::uuid AND object_id = $2::uuid`,
            [actor.id, targetId],
          )
        },
      },
    )
    await using install = await beginTransaction()
    await upsertEntityRelation(null, relation, actor, [{ id: targetId }], {
      query: install,
      origin: 'remote',
      remoteFollowCycle: { expectedId: null, nextId: firstId },
    })
    await install.commit()
    await runAndCapture(
      'activitypub-follow-cas-replace',
      async () => {
        await using query = await beginTransaction()
        const prior = await readRemoteFollowCyclePointer(actor.id, targetId, { query })
        assert.equal(prior, firstId)
        await retireRemoteFollowCycle(firstId, { query })
        const rows = await upsertEntityRelation(null, relation, actor, [{ id: targetId }], {
          query,
          origin: 'remote',
          remoteFollowCycle: { expectedId: prior, nextId: secondId },
        })
        assert.equal(rows.length, 1)
        await query.commit()
      },
      undefined,
      ['readRemoteFollowCyclePointer', 'retireRemoteFollowCycle', 'installRemoteFollowCycle'],
      {
        afterCapture: async () => {
          await write(
            `/* resetExplainFollowActivity */ UPDATE activitypub_remote_follow_activities SET undone_at = NULL WHERE id = $1::uuid`,
            [firstId],
          )
          await write(
            `/* resetExplainFollowRelation */ UPDATE relation__remote_actor__follow__user SET inbound_follow_activity_row_id = $3::uuid WHERE subject_id = $1::uuid AND object_id = $2::uuid`,
            [actor.id, targetId, firstId],
          )
        },
      },
    )
    await using tombstone = await beginTransaction()
    assert.ok(await markRemoteFollowUndone(undoActivity, actor, targetId, { query: tombstone }))
    await tombstone.commit()
    await runAndCapture(
      'activitypub-follow-confirm-tombstone',
      async () => {
        await using query = await beginTransaction()
        assert.equal(
          (await reserveRemoteFollowCycle(undoActivity, actor.id, targetId, { query })).isUndone,
          true,
        )
        await query.commit()
      },
      undefined,
      'confirmRemoteFollowActivity',
      {
        afterCapture: async () => {
          await write(
            `/* resetExplainFollowConfirmation */ UPDATE activitypub_remote_follow_activities SET confirmed_at = NULL WHERE activity_id = $1`,
            [undoActivity],
          )
        },
      },
    )
  } finally {
    await write(
      `/* cleanupExplainFollowRelation */ DELETE FROM relation__remote_actor__follow__user WHERE subject_id = $1::uuid AND object_id = $2::uuid`,
      [actor.id, targetId],
    )
    await write(
      `/* cleanupExplainFollowActivities */ DELETE FROM activitypub_remote_follow_activities WHERE remote_actor_identity_id = $1::uuid AND activity_id = ANY($2::text[])`,
      [actor.id, [firstActivity, secondActivity, undoActivity]],
    )
  }
}
