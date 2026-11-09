import assert from 'node:assert/strict'
import { v7 } from 'uuid'
import { write } from '@data-stores/psql'
import { processUserDeletionCredentialsBatch } from '@services/users/delete-phase-credentials'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { runLogoutPushCleanupAndRevoke } from '@services/jwt-session/logout-cleanup-lease'

export async function runSessionCutoffCleanupScenarios(
  userId: string,
  newer: string,
): Promise<void> {
  registerScenarioContract('session-cutoff-logout-admission', {
    seededRows: { user_session_revocation_cutoffs: 4_000 },
    forbidSequentialScans: ['user_session_revocation_cutoffs'],
    expectations: [
      { kind: 'maxProcessedRows', relation: 'users', max: 2 },
      { kind: 'maxProcessedRows', relation: 'user_sessions', max: 2 },
      { kind: 'maxProcessedRows', relation: 'user_session_revocation_cutoffs', max: 2 },
    ],
  })
  await runAndCapture(
    'session-cutoff-logout-admission',
    async () => {
      let cleaned = false
      await runLogoutPushCleanupAndRevoke(newer, { userId }, async () => {
        cleaned = true
      })
      assert.equal(cleaned, true)
    },
    undefined,
    'admitLogoutCleanup',
    {
      afterCapture: async () => {
        await write(
          '/* restoreSessionCutoffLogout */ UPDATE user_sessions SET revoked_at = NULL WHERE id = $1 AND user_id = $2',
          [newer, userId],
        )
      },
    },
  )
  const deletionUserId = v7()
  await write('/* seedCutoffDeletionUser */ INSERT INTO users (id, username) VALUES ($1, $2)', [
    deletionUserId,
    `cutoff-deletion-${deletionUserId}`,
  ])
  try {
    await write(
      `/* seedCutoffDeletionBoundary */ INSERT INTO user_session_revocation_cutoffs (user_id, cutoff_at)
       VALUES ($1, CURRENT_TIMESTAMP - INTERVAL '1 day')`,
      [deletionUserId],
    )
    registerScenarioContract('session-cutoff-deletion', {
      seededRows: { user_session_revocation_cutoffs: 4_000 },
      forbidSequentialScans: ['user_session_revocation_cutoffs'],
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'user_session_revocation_cutoffs', max: 2 },
      ],
    })
    await runAndCapture(
      'session-cutoff-deletion',
      async () => {
        assert.equal((await processUserDeletionCredentialsBatch(deletionUserId, 1)).hasMore, true)
      },
      undefined,
      'processUserDeletionCredentials:sessionCutoff',
      {
        afterCapture: async () => {
          await write(
            `/* restoreSessionCutoffBoundary */ INSERT INTO user_session_revocation_cutoffs
           (user_id, cutoff_at) VALUES ($1, CURRENT_TIMESTAMP - INTERVAL '1 day')`,
            [deletionUserId],
          )
        },
      },
    )
  } finally {
    await write('/* cleanupCutoffDeletionUser */ DELETE FROM users WHERE id = $1', [deletionUserId])
  }
}
