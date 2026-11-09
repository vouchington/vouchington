import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { readActivityPubReplayFloor } from '@services/ap-inbox-activities/replay-floor'
import { recordInboxActivity } from '@services/ap-inbox-activities/record-activity'
import {
  reserveRemoteFollowCycle,
  markRemoteFollowUndone,
} from '@services/ap-inbox-activities/follow-cycles'
import { upsertElectionVotesShared } from '@services/elections-votes/shared/vote-upsert'
import { TOPIC_ELECTION_CONFIG } from '@services/elections-votes/topic/config'
import { runAndCapture, seedUser, seedTopicId } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

/** Fresh receipt identities and rollback keep both paired plans repeatable on the seeded corpus. */
export async function runActivityPubVoteAuthorityScenarios(): Promise<void> {
  registerScenarioContract('activitypub-receipt-floor-snapshot', {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'activitypub_replay_rejection_floors', max: 1 },
      { kind: 'maxProcessedRows', relation: 'activitypub_inbox_activities', max: 2 },
    ],
  })
  await runAndCapture(
    'activitypub-receipt-floor-snapshot',
    async () => {
      await using query = await beginTransaction()
      await readActivityPubReplayFloor(query)
      assert.equal(
        await recordInboxActivity(
          `https://remote.example/explain/${randomUUID()}`,
          'Announce',
          'https://remote.example/users/actor',
          { query, signedAt: new Date() },
        ),
        true,
      )
      await query.rollback()
    },
    undefined,
    ['readActivityPubReplayFloor', 'recordInboxActivity', 'recheckInboxActivityReplayFloor'],
  )

  registerScenarioContract('activitypub-follow-identity-constraints', {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'users', max: 2 },
      { kind: 'maxProcessedRows', relation: 'remote_actors', max: 2 },
      { kind: 'maxProcessedRows', relation: 'activitypub_remote_follow_activities', max: 2 },
    ],
  })
  const noisePrefix = `https://remote.example/explain-follow-noise/${randomUUID()}`
  const noise = await write<{ id: string }>(
    `/* seedExplainRemoteFollowNoise */ INSERT INTO activitypub_remote_follow_activities
       (remote_actor_identity_id, target_user_id, activity_id)
     SELECT $1::uuid, $2::uuid, $3 || '/' || n FROM generate_series(1, 2000) AS n
     RETURNING id`,
    [seedUuid(0, '19'), seedUser.id, noisePrefix],
  )
  try {
    await write(
      '/* analyzeExplainRemoteFollowNoise */ ANALYZE activitypub_remote_follow_activities',
    )
    await runAndCapture(
      'activitypub-follow-identity-constraints',
      async () => {
        await using query = await beginTransaction()
        const actor = {
          id: seedUuid(0, '19'),
          actor_uri: 'https://remote-follower-0.example/users/actor',
        }
        const id = `${actor.actor_uri}/activities/${randomUUID()}`
        await reserveRemoteFollowCycle(id, actor.id, seedUser.id, { query })
        await reserveRemoteFollowCycle(id, actor.id, seedUser.id, { query })
        assert.ok(await markRemoteFollowUndone(id, actor, seedUser.id, { query }))
        await query.rollback()
      },
      undefined,
      [
        'findConfirmedRemoteFollowActivityOwner',
        'reserveRemoteFollowCycle',
        'readRemoteFollowCycle',
        'confirmRemoteFollowActivity',
        'markRemoteFollowUndone',
      ],
    )
  } finally {
    await write(
      '/* cleanupExplainRemoteFollowNoise */ DELETE FROM activitypub_remote_follow_activities WHERE id = ANY($1::uuid[])',
      [noise.rows.map(row => row.id)],
    )
    await write(
      '/* analyzeAfterExplainRemoteFollowNoise */ ANALYZE activitypub_remote_follow_activities',
    )
  }

  registerScenarioContract('election-vote-lifecycle-snapshot', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'users', max: 4 },
      { kind: 'maxProcessedRows', relation: 'topic_votes', max: 4 },
    ],
  })
  await runAndCapture(
    'election-vote-lifecycle-snapshot',
    async () => {
      await using query = await beginTransaction()
      await upsertElectionVotesShared(
        TOPIC_ELECTION_CONFIG,
        seedUser.id,
        [{ entityId: seedTopicId, score: -1 }],
        undefined,
        { query },
      )
      await query.rollback()
    },
    undefined,
    ['assertActiveElectionVoter', 'upsertElectionVotesShared'],
  )
}
